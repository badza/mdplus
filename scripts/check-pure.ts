import assert from "node:assert/strict";
import { fileName, parentDir } from "../src/lib/path.ts";
import { isLocalMachineUrl } from "../src/lib/net.ts";
import { restoredActiveId } from "../src/lib/restoreActive.ts";
import { findRanges, selectedFindText } from "../src/lib/preview/previewFind.ts";

assert.equal(fileName("/Users/me/notes/a.md"), "a.md");
assert.equal(fileName("C:\\Notes\\todo.md"), "todo.md");
assert.equal(fileName("todo.md"), "todo.md");
assert.equal(parentDir("/Users/me/notes/a.md"), "/Users/me/notes");
assert.equal(parentDir("/a.md"), "/");
assert.equal(parentDir("C:\\Notes\\todo.md"), "C:\\Notes");
assert.equal(parentDir("todo.md"), "todo.md");

assert.equal(isLocalMachineUrl("http://127.0.0.1:8787/secret"), true);
assert.equal(isLocalMachineUrl("http://127.1.2.3/a.png"), true);
assert.equal(isLocalMachineUrl("http://[::1]/a.png"), true);
assert.equal(isLocalMachineUrl("http://localhost:8080/a.png"), true);
assert.equal(isLocalMachineUrl("http://169.254.169.254/latest"), true);
assert.equal(isLocalMachineUrl("//127.0.0.1/a.png"), true);
assert.equal(isLocalMachineUrl("https://example.com/a.png"), false);
assert.equal(isLocalMachineUrl("http://asset.localhost/Users/me/a.png"), false);
assert.equal(isLocalMachineUrl("https://10.1.2.3/a.png"), false);

const opened = [
  { index: 1, id: "a" },
  { index: 2, id: "b" },
];
assert.equal(restoredActiveId(opened, 2), "b");
assert.equal(restoredActiveId(opened, 0), "a");
assert.equal(restoredActiveId([], 0), null);

const plain = { search: "cat", caseSensitive: false, regexp: false, wholeWord: false };
assert.deepEqual(findRanges("Cat catalog", plain).map((r) => r.from), [0, 4]);
assert.deepEqual(
  findRanges("Cat catalog", { ...plain, caseSensitive: true }).map((r) => r.from),
  [4],
);
assert.deepEqual(
  findRanges("the cat catalog", { ...plain, wholeWord: true }).map((r) => r.from),
  [4],
);
assert.deepEqual(findRanges("cat cot", { ...plain, search: "c.t", regexp: true }).map((r) => r.from), [0, 4]);
assert.deepEqual(findRanges("abc", { ...plain, search: "[", regexp: true }), []);
assert.deepEqual(findRanges("a\nb", { ...plain, search: "a\\nb" }), [{ from: 0, to: 3 }]);
const starred = findRanges("aaaa", { ...plain, search: "a*", regexp: true });
assert.ok(starred.length < 20);
assert.ok(starred.every((r) => r.to > r.from));
assert.equal(selectedFindText(""), "");
assert.equal(selectedFindText("cat"), "cat");
assert.equal(selectedFindText("a\nb"), "a\\nb");
assert.equal(selectedFindText("a".repeat(101)), "");

console.log("ok");
