// The pieces of CodeMirror 6 the article editor uses, bundled into
// ../codemirror.bundle.js as the global SkeCM. Rebuild: npm install && npm run build
export { EditorState, StateEffect, RangeSetBuilder } from "@codemirror/state";
export { EditorView, ViewPlugin, Decoration, keymap, placeholder, drawSelection } from "@codemirror/view";
export { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
export { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
export { autocompletion, completionKeymap } from "@codemirror/autocomplete";
