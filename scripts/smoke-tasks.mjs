/**
 * Live smoke test for #45: tasks update, due filters, subtasks, list management.
 *
 * Creates a temp task list, parent + subtask, exercises due-window filters,
 * update, complete, rename, then cleans up.
 *
 * Run: npx tsx scripts/smoke-tasks.mjs
 */
import { authManager } from "../src/auth/manager.js";
import {
  completeTask,
  createTask,
  createTaskList,
  deleteTask,
  deleteTaskList,
  listTasks,
  updateTask,
  updateTaskList,
} from "../src/services/contacts-tasks.js";

const now = Date.now();
const dueA = new Date(now + 24 * 3600 * 1000).toISOString();
const dueB = new Date(now + 48 * 3600 * 1000).toISOString();
const beforeDueB = new Date(now + 47 * 3600 * 1000).toISOString();

async function main() {
  const acc = await authManager.resolveAccount();
  const client = await authManager.getClient(acc.name);
  const list = await createTaskList(client, { title: `smoke-45-${now}` });
  console.log(`list id=${list.id}`);
  let parentId;
  let childId;
  try {
    const parent = await createTask(client, {
      tasklistId: list.id,
      title: "Parent task",
      due: dueA,
    });
    parentId = parent.id;
    console.log(`parent id=${parentId}`);

    const child = await createTask(client, {
      tasklistId: list.id,
      title: "Subtask",
      parentTaskId: parentId,
      due: dueB,
    });
    childId = child.id;
    console.log(`child id=${childId}`);

    const dueWindow = await listTasks(client, {
      tasklistId: list.id,
      dueMin: dueA,
      dueMax: beforeDueB,
    });
    console.log(`due filter (24h window) returned: ${dueWindow.map((t) => t.title).join(",")}`);
    if (dueWindow.length !== 1 || dueWindow[0].id !== parentId) {
      throw new Error("due window filter expected only the parent task");
    }

    const updated = await updateTask(client, {
      tasklistId: list.id,
      taskId: parentId,
      title: "Parent task (renamed)",
      notes: "updated via smoke",
    });
    console.log(`updated title: ${updated.title}`);
    if (updated.title !== "Parent task (renamed)") throw new Error("update failed");

    await completeTask(client, { tasklistId: list.id, taskId: parentId });
    const completed = await listTasks(client, { tasklistId: list.id });
    console.log(
      `after complete, statuses: ${completed.map((t) => `${t.title}=${t.status}`).join(",")}`,
    );
    if (completed.find((t) => t.id === parentId)?.status !== "completed") {
      throw new Error("complete failed");
    }

    const renamed = await updateTaskList(client, {
      tasklistId: list.id,
      title: `smoke-45-${now}-renamed`,
    });
    console.log(`renamed list: ${renamed.title}`);
    if (!renamed.title?.endsWith("-renamed")) throw new Error("rename failed");

    console.log("SMOKE PASSED");
  } finally {
    if (parentId) await deleteTask(client, { tasklistId: list.id, taskId: parentId });
    if (childId) await deleteTask(client, { tasklistId: list.id, taskId: childId });
    await deleteTaskList(client, { tasklistId: list.id });
    console.log(`cleaned up ${list.id}`);
  }
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});
