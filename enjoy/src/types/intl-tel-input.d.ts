// `intl-tel-input` publishes `intlTelInputWithUtils` as a package export and
// points it at the same types as the package root. `moduleResolution: "node"`
// predates package exports, so it cannot follow that mapping. Switching the
// whole project to `"bundler"` resolves this one import and breaks four others,
// in packages whose own `exports` omit their types — so the fence goes here,
// around the one subpath that needs it, rather than around the project.
declare module "intl-tel-input/intlTelInputWithUtils" {
  import intlTelInput from "intl-tel-input";
  export * from "intl-tel-input";
  export default intlTelInput;
}
