import {
  AfterUpdate,
  AfterDestroy,
  Table,
  Column,
  Default,
  IsUUID,
  Model,
  DataType,
  AfterCreate,
  AllowNull,
  HasMany,
  Scopes,
  BeforeSave,
} from "sequelize-typescript";
import log from "@main/logger";
import { ChatAgent, ChatMember, ChatMessage } from "@main/db/models";
import { InstanceDestroyOptions } from "sequelize";
import { destroyEach } from "@main/db/destroy-each";
import mainWindow from "@main/window";
import { t } from "i18next";
import { ChatAgentTypeEnum, ChatTypeEnum } from "@/types/enums";

const logger = log.scope("db/models/chat");
@Table({
  modelName: "Chat",
  tableName: "chats",
  underscored: true,
  timestamps: true,
})
@Scopes(() => ({
  defaultScope: {
    include: [
      {
        association: "members",
        model: ChatMember,
        include: [
          {
            association: "agent",
            model: ChatAgent,
            required: false,
          },
        ],
        required: false,
      },
    ],
  },
}))
export class Chat extends Model<Chat> {
  @IsUUID("all")
  @Default(DataType.UUIDV4)
  @Column({ primaryKey: true, type: DataType.UUID })
  id: string;

  @Column(DataType.STRING)
  type: ChatTypeEnum;

  @AllowNull(false)
  @Column(DataType.STRING)
  name: string;

  @Column(DataType.TEXT)
  digest: string;

  @Column(DataType.JSON)
  config: any;

  // What a deleted Chat takes with it is spelled out in `destroyContents`
  // below, rather than left to `onDelete` on these associations: Sequelize's
  // own cascade cannot let a member that will not go be logged and stepped
  // over, and a Chat that cannot be deleted because one message under it is
  // broken is worse than a file left behind.
  @HasMany(() => ChatMessage, {
    foreignKey: "chatId",
    constraints: false,
  })
  messages: ChatMessage[];

  @HasMany(() => ChatMember, {
    foreignKey: "chatId",
    constraints: false,
    onUpdate: "CASCADE",
  })
  members: ChatMember[];

  @Column(DataType.VIRTUAL)
  get membersCount(): number {
    return this.members?.length;
  }

  @Column(DataType.VIRTUAL)
  get sttEngine(): string {
    return this.config?.sttEngine;
  }

  @AfterCreate
  static async notifyForCreate(chat: Chat) {
    Chat.notify(chat, "create");
  }

  @AfterUpdate
  static async notifyForUpdate(chat: Chat) {
    Chat.notify(chat, "update");
  }

  @AfterDestroy
  static async notifyForDestroy(chat: Chat) {
    Chat.notify(chat, "destroy");
  }

  static async notify(chat: Chat, action: "create" | "update" | "destroy") {
    if (!mainWindow.win) return;

    let chatData = { id: chat?.id };
    if (action !== "destroy") {
      chat = await Chat.findByPk(chat?.id);
      chatData = chat?.toJSON() || chatData;
    }

    mainWindow.win.webContents.send("db-on-transaction", {
      model: "Chat",
      id: chatData.id,
      action,
      record: chatData,
    });
  }

  @BeforeSave
  static async setupChatType(chat: Chat) {
    if (chat.isNewRecord && chat.type) {
      return;
    }

    const members = await ChatMember.findAll({
      where: { chatId: chat.id },
    });

    if (members.length < 1) {
      throw new Error(t("models.chat.atLeastOneAgent"));
    } else if (members.length > 1) {
      // For group chat, all members must be GPT agent
      if (members.some((m) => m.agent?.type !== ChatAgentTypeEnum.GPT)) {
        throw new Error(t("models.chat.onlyGPTAgentCanBeAddedToThisChat"));
      }
      chat.type = ChatTypeEnum.GROUP;
    } else {
      const agent = members[0].agent;
      if (!agent) {
        logger.error("Chat.setupChatType: agent not found", chat.id);
        throw new Error(t("models.chat.atLeastOneAgent"));
      }

      switch (agent.type) {
        case ChatAgentTypeEnum.GPT:
          chat.type = ChatTypeEnum.CONVERSATION;
          break;
        case ChatAgentTypeEnum.TTS:
          chat.type = ChatTypeEnum.TTS;
          break;
        default:
          logger.error("Chat.setupChatType: invalid agent type", chat.id);
          throw new Error(t("models.chat.invalidAgentType"));
      }
    }
  }

  /**
   * Members first, then whatever messages are left. Members first because a
   * member takes its own messages with it, and Speeches and Recordings go under
   * those; what is left over afterwards is the learner's own half of the
   * conversation, which belongs to no member and holds the recordings of them
   * shadowing it.
   *
   * The order also settles the goodbyes: a member says "X has left the chat" on
   * its way out, and cannot tell being removed from a chat that stays from
   * going down with the chat itself. Sweeping the chat's messages after its
   * members takes those notices too, rather than leaving them in a chat nobody
   * can open again.
   */
  @AfterDestroy
  static async destroyContents(chat: Chat, options?: InstanceDestroyOptions) {
    const transaction = options?.transaction;

    await destroyEach(ChatMember, { chatId: chat.id }, { transaction });
    await destroyEach(ChatMessage, { chatId: chat.id }, { transaction });
  }
}
