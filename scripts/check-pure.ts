import assert from "node:assert/strict";
import { fileName, parentDir } from "../src/lib/path.ts";
import { isLocalMachineUrl } from "../src/lib/net.ts";
import { restoredActiveId } from "../src/lib/restoreActive.ts";

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

console.log("ok");
