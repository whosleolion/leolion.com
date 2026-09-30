# Winkipedia article editor (preview only)

On the preview (leolion.com/building/skunkpets-preview/) a yellow
**✎ Edit articles** button sits in the bottom-left corner. It opens a panel
beside the game; the game shrinks to make room.

1. Open any Winkipedia page in the game's browser (Winkipedia articles, the
   fan wiki, the games archive: anything tagged `wiki`). Its text appears in
   the panel. Follow links in the game and the panel follows along.
2. Edit. The game shows your changes as you type. Links and photos use a short
   form (the Cheat sheet in the panel has it):
   - `[[Tom Barry]]` links to a page; `[[the founder->Tom Barry]]` links with
     other words.
   - `[[photo: file.jpg | right | description]]` is a photo;
     `[[photo: file.jpg | left | 36% | description]]` floats it left at 36%
     wide. Move the line to move the photo; right after a heading puts it
     beside that section. Delete the line to remove it.
   - **+ Photo** adds a picture from your computer (shrunk to 480 px wide and
     saved as JPEG) and puts its line where your cursor is.
   Unsaved edits are kept in this browser, so a reload doesn't lose them.
3. **Save to preview** makes one commit on GitHub with every page you changed
   and any new photos they use, on the branch this preview was built from. The
   preview workflow rebuilds within about a minute. Your changes keep showing
   in the meantime. From there they ship like any other change.

**GitHub access (once per browser).** Saving needs a fine-grained personal
access token: GitHub → Settings → Developer settings → Fine-grained tokens →
Generate new token; Repository access: *Only select repositories* →
`whosleolion/leolion.com`; Permissions → Repository permissions → add
*Contents* and switch its dropdown from *Read-only* (the default) to
*Read and write*. A read-only token gets as far as "Saving…" and then fails;
you can fix it by editing the token's permissions on GitHub, no need to make a
new one. Paste it under **GitHub access** in the panel. It's stored only in this
browser's localStorage for leolion.com; **Forget** removes it.

**Comments.** Under the text box, **Comments on this page** holds notes for
whoever edits next; they never appear in the game. Select words in the article
first and your comment quotes them. **Resolve** marks a note done (it folds
into "Resolved"; **Reopen** brings it back); you can **Delete** your own. The
first time you post, it asks your name (**My name…** changes it). Notes on
other pages are listed with a **Go** button that opens that page in the game
(Browse has to be out of the Trash). The ✎ button shows how many notes are
open, and the list refreshes every minute while the panel is open (or press
**Refresh**). Each comment is its own small commit to
`tools/skunkpets-redux/editor/comments.json` on the same branch; it doesn't
rebuild the preview. The repository is public, so so are the comments.

**If someone else changed the same page** since the preview was built (e.g. a
push from Claude), saving asks before overwriting it. Other pages' changes are
kept; only the pages you edited are replaced.

What it can't do (yet): rename or create pages, or edit the game's other
passages (desktop, mail, Diskette). Those are still edited in the `.twee`.

## Files

- `editor.js`, `editor.css`: the editor. The preview workflow uploads them and
  adds them to the preview page; the live game never loads them. It talks to
  the game through `window.SkunkpetsEditorHook` (script section
  `PREVIEW EDITOR HOOK`), which only exists on the preview.
- `roundtrip-test.js`: checks the short link/photo form converts back exactly
  for every page in the `.twee` (`node tools/skunkpets-redux/editor/roundtrip-test.js`).
- `editor-test.mjs`: browser test with GitHub faked. Needs a local preview
  copy: build, run the workflow's "Make the preview copy" commands (or copy
  `src/building/skunkpets` to `src/building/skunkpets-preview`
  and add the editor tags by hand), serve `src/` on port 8765, then run it
  from a folder where `playwright` resolves, with `REPO_ROOT` set to the repo.
  `src/building/skunkpets-preview/` is git-ignored; never commit it.
