import {
  AfterUpdate,
  AfterDestroy,
  BelongsTo,
  Table,
  Column,
  Default,
  IsUUID,
  Model,
  DataType,
  AfterCreate,
  AllowNull,
  Scopes,
} from "sequelize-typescript";
import log from "@main/logger";
import { Chat, ChatAgent, ChatMessage } from "@main/db/models";
import mainWindow from "@main/window";
import { ChatMessageCategoryEnum, ChatMessageRoleEnum } from "@/types/enums";

const logger = log.scope("db/models/chat-member");
@Table({
  modelName: "ChatMember",
  tableName: "chat_members",
  underscored: true,
  timestamps: true,
})
@Scopes(() => ({
  defaultScope: {
    include: [
      {
        association: "agent",
        model: ChatAgent,
        required: false,
      },
    ],
  },
}))
export class ChatMember extends Model<ChatMember> {
  @IsUUID("all")
  @Default(DataType.UUIDV4)
  @Column({ primaryKey: true, type: DataType.UUID })
  id: string;

  @AllowNull(false)
  @Column(DataType.UUID)
  chatId: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  userId: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  userType: string;

  @Column(DataType.JSON)
  config: any;

  @BelongsTo(() => Chat, {
    foreignKey: "chatId",
    constraints: false,
  })
  chat: Chat;

  @BelongsTo(() => ChatAgent, {
    foreignKey: "userId",
    constraints: false,
  })
  agent: ChatAgent;

  @Column(DataType.VIRTUAL)
  get name(): string {
    return this.agent?.name;
  }

  @AfterCreate
  static async updateChats(member: ChatMember) {
    const chat = await Chat.findByPk(member.chatId);
    if (chat) {
      chat.changed("updatedAt", true);
      chat.update({ updatedAt: new Date() });
    }
  }

  @AfterCreate
  static async chatSystemAddedMessage(member: ChatMember) {
    const chatAgent = await ChatAgent.findByPk(member.userId);
    if (!chatAgent) return;
    chatAgent.changed("updatedAt", true);
    chatAgent.update({ updatedAt: new Date() });

    ChatMessage.create({
      chatId: member.chatId,
      content: `${chatAgent.name} has joined the chat.`,
      agentId: chatAgent.id,
      role: ChatMessageRoleEnum.SYSTEM,
      category: ChatMessageCategoryEnum.MEMBER_JOINED,
    });
  }

  /**
   * Messages go one at a time, and awaited, for the reason they do everywhere
   * else: a bulk destroy fires only the bulk hooks, so
   * `ChatMessage.destroySpeechesAndRecordings` never runs, and the Speech under each
   * message — with the mp3 it names — stays in the Library with nothing
   * pointing at it. Awaited so that a member is not answered as removed while
   * the messages it spoke are still on their way out.
   *
   * A message that will not go is logged rather than thrown, as a Diary's
   * Speeches already are: a file left behind is not a reason to refuse to
   * remove the member who owned it.
   *
   * The hooks were off here, without a reason written down. The one that can
   * be read off the code is that the renderer is now told about each message
   * individually rather than not at all — which is what it wants: the messages
   * are leaving the open chat, and a renderer that is not told keeps drawing
   * them until something else reloads the chat. So the notification is the
   * point, not the cost.
   */
  @AfterDestroy
  static async destroyMessages(member: ChatMember) {
    const messages = await ChatMessage.findAll({
      where: { memberId: member.id },
    });

    for (const message of messages) {
      await message.destroy().catch((err: Error) => {
        logger.error("failed to destroy chat message:", err.message);
      });
    }

    ChatAgent.findByPk(member.userId).then((chatAgent) => {
      if (!chatAgent) return;

      ChatMessage.create({
        chatId: member.chatId,
        content: `${chatAgent.name} has left the chat.`,
        agentId: chatAgent.id,
        role: ChatMessageRoleEnum.SYSTEM,
        category: ChatMessageCategoryEnum.MEMBER_LEFT,
      });
    });
  }

  @AfterCreate
  static notifyForCreate(member: ChatMember) {
    this.notify(member, "create");
  }

  @AfterUpdate
  static notifyForUpdate(member: ChatMember) {
    this.notify(member, "update");
  }

  @AfterDestroy
  static notifyForDestroy(member: ChatMember) {
    this.notify(member, "destroy");
  }

  static async notify(
    member: ChatMember,
    action: "create" | "update" | "destroy"
  ) {
    if (!mainWindow.win) return;

    if (action !== "destroy") {
      member = await ChatMember.findByPk(member.id);
    }
    mainWindow.win.webContents.send("db-on-transaction", {
      model: "ChatMember",
      id: member.id,
      action,
      record: member.toJSON(),
    });
  }
}
