# @donotdev/mcp-server

## Unreleased

### Patch Changes

- `lookup_symbol` finds `@donotdev/core` symbols again (`useTranslation`, `defineEntity`, …): the published core is flattened to the package root, where the index was never looked for.
- `lookup_symbol` returns `XOwnProps` next to `XProps` (and for an `XProps` lookup): polymorphic components declare `XProps = XOwnProps & Omit<native props>`, so the real props were missing from the answer.

