import {
  AfterCreate,
  AfterDestroy,
  BelongsTo,
  BeforeDestroy,
  ForeignKey,
  Scopes,
  Table,
  Column,
  Default,
  IsUUID,
  Model,
  DataType,
  AllowNull,
  HasMany,
} from "sequelize-typescript";
import { Conversation, Speech } from "@main/db/models";
import mainWindow from "@main/window";
import log from "@main/logger";

const logger = log.scope("db/models/message");

@Table({
  modelName: "Message",
  tableName: "messages",
  underscored: true,
  timestamps: true,
})
@Scopes(() => ({
  withConversation: {
    include: [Conversation],
  },
  asc: {
    order: [["createdAt", "ASC"]],
  },
  desc: {
    order: [["createdAt", "DESC"]],
  },
}))
export class Message extends Model<Message> {
  @IsUUID(4)
  @Default(DataType.UUIDV4)
  @Column({ primaryKey: true, type: DataType.UUID })
  id: string;

  @BelongsTo(() => Conversation)
  conversation: Conversation;

  @ForeignKey(() => Conversation)
  @Column(DataType.UUIDV4)
  conversationId: string;

  @HasMany(() => Speech, {
    foreignKey: "sourceId",
    scope: { sourceType: "Message" },
  })
  speeches: Speech[];

  @AllowNull(false)
  @Column(DataType.ENUM("assistant", "user"))
  role: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  content: string;

  createSpeech(configuration: { [key: string]: any } = {}) {
    return Speech.generate({
      sourceId: this.id,
      sourceType: "Message",
      text: this.content,
      configuration,
    });
  }

  @AfterCreate
  static notifyForCreate(message: Message) {
    this.notify(message, "create");
  }

  /**
   * Speeches are derivatives of text that is going away, so they go with it.
   *
   * Awaited, so that the Message is not answered as deleted while the Speeches
   * it owned are still on their way out. Destroying them one at a time rather
   * than in bulk is deliberate — it is what runs the hooks that remove the mp3.
   * A Speech that will not go is logged rather than thrown, as it is for a
   * Diary: a file left behind is not a reason to refuse to delete the Message.
   */
  @BeforeDestroy
  static async destroySpeeches(message: Message) {
    const speeches = await Speech.findAll({
      where: {
        sourceId: message.id,
        sourceType: "Message",
      },
    });

    for (const speech of speeches) {
      await speech.destroy().catch((err: Error) => {
        logger.error("failed to destroy speech:", err.message);
      });
    }
  }

  @AfterDestroy
  static notifyForDestroy(message: Message) {
    this.notify(message, "destroy");
  }

  static notify(message: Message, action: "create" | "update" | "destroy") {
    if (!mainWindow.win) return;

    mainWindow.win.webContents.send("db-on-transaction", {
      model: "Message",
      id: message.id,
      action: action,
      record: message.toJSON(),
    });
  }
}
