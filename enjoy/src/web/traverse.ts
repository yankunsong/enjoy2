/**
 * The one walk both bridge transforms take through an argument list.
 *
 * Two things crossing the seam cannot be said in the other side's terms — a
 * Library address and a run of bytes — and both are found the same way: descend
 * into arrays and plain objects, transform what matches, leave the rest.
 *
 * Arrays and plain objects are the only containers worth descending into. A
 * Date, a Blob or a File rebuilt from its properties would be worse than one
 * left alone, and neither holds anything either transform is looking for.
 */
export const walk = <T>(value: T, self: <V>(value: V) => V): T => {
  if (Array.isArray(value)) return value.map(self) as T;

  if (value?.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value as object).map(([key, item]) => [key, self(item)])
    ) as T;
  }

  return value;
};
