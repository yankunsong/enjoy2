import { Attributes, InstanceDestroyOptions, WhereOptions } from "sequelize";
import { Model, ModelCtor } from "sequelize-typescript";
import log from "@main/logger";

const logger = log.scope("db/destroy-each");

/**
 * Destroy every record of `model` matching `where`, one at a time and awaited.
 * The shape every deletion path in the Library needs, and the reason it is a
 * shape rather than a `Model.destroy` call:
 *
 * One at a time, because a bulk destroy fires only the bulk hooks — so the
 * hooks that take a Speech's mp3 or a Recording's audio with the record never
 * run, and the file stays in the Library with nothing left that can reach it.
 *
 * Awaited, so that whatever owned these records is not answered as deleted
 * while they are still on their way out.
 *
 * `options.transaction` is the one the owner is being destroyed in, where there
 * is one. On SQLite a transaction holds a connection of its own, so a query
 * left outside it is answered `SQLITE_BUSY` by the database the owner has
 * already locked — and the catch below would swallow that and leave the file.
 *
 * A record that will not go is logged rather than thrown: a file left behind is
 * not a reason to refuse to delete the thing that owned it.
 */
export const destroyEach = async <M extends Model>(
  model: ModelCtor<M>,
  where: WhereOptions<Attributes<M>>,
  options?: InstanceDestroyOptions
) => {
  const records = await model.findAll({
    where,
    transaction: options?.transaction,
  });

  for (const record of records) {
    await record.destroy(options).catch((err: Error) => {
      logger.error(`failed to destroy ${model.name}:`, err.message);
    });
  }
};
