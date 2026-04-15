import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9AaCk1HCTJsyfFTjQ-vYcN9QBT869CsQ",
  authDomain: "my-flowtask.firebaseapp.com",
  projectId: "my-flowtask",
  storageBucket: "my-flowtask.firebasestorage.app",
  messagingSenderId: "983900311064",
  appId: "1:983900311064:web:503ca652e6e2f027fa3d6d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const TASKS_REF = collection(db, "tasks");
const GROUPS_REF = collection(db, "groups");

const searchInput = document.querySelector("#search-input");
const filterStatus = document.querySelector("#filter-status");
const sortSelect = document.querySelector("#sort-select");
const clearCompletedButton = document.querySelector("#clear-completed-button");
const saveGroupButton = document.querySelector("#save-group-button");
const groupNameInput = document.querySelector("#group-name-input");
const groupColorInput = document.querySelector("#group-color-input");
const groupTableTemplate = document.querySelector("#group-table-template");
const taskTemplate = document.querySelector("#task-template");
const addTaskRowTemplate = document.querySelector("#add-task-row-template");
const groupedTables = document.querySelector("#grouped-tables");
const emptyState = document.querySelector("#empty-state");
const summaryChart = document.querySelector("#summary-chart");
const confirmModal = document.querySelector("#confirm-modal");
const confirmModalText = document.querySelector("#confirm-modal-text");
const confirmNoButton = document.querySelector("#confirm-no-button");
const confirmYesButton = document.querySelector("#confirm-yes-button");

const counters = {
  total: document.querySelector("#total-count"),
  active: document.querySelector("#active-count"),
  done: document.querySelector("#done-count"),
  priority: document.querySelector("#priority-count")
};

let tasks = [];
let groups = [];
let collapsedGroups = new Set();
let pendingGroupDelete = null;

searchInput.addEventListener("input", render);
filterStatus.addEventListener("change", render);
sortSelect.addEventListener("change", render);
window.addEventListener("resize", renderSummaryChart);

clearCompletedButton.addEventListener("click", async () => {
  const doneTasks = tasks.filter((task) => task.status === "done");

  if (doneTasks.length === 0) {
    return;
  }

  await Promise.all(doneTasks.map((task) => deleteTaskFromDB(task.id)));
  tasks = tasks.filter((task) => task.status !== "done");
  render();
});

saveGroupButton.addEventListener("click", async () => {
  const name = groupNameInput.value.trim();

  if (!name) {
    groupNameInput.focus();
    return;
  }

  if (groups.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
    groupNameInput.value = "";
    groupNameInput.focus();
    return;
  }

  const group = { name, color: groupColorInput.value };
  const id = await addGroupToDB(group);
  groups.push({ id, ...group });
  groupNameInput.value = "";
  groupColorInput.value = "#2563eb";
  groupNameInput.focus();
  render();
});

confirmNoButton.addEventListener("click", closeConfirmModal);
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) {
    closeConfirmModal();
  }
});

confirmYesButton.addEventListener("click", async () => {
  if (!pendingGroupDelete || groups.length === 1) {
    closeConfirmModal();
    return;
  }

  const groupToDelete = groups.find((group) => group.name === pendingGroupDelete);
  const fallbackGroup = groups.find((group) => group.name !== pendingGroupDelete);

  if (!groupToDelete || !fallbackGroup) {
    closeConfirmModal();
    return;
  }

  const affectedTasks = tasks.filter((task) => task.category === groupToDelete.name);

  await Promise.all(
    affectedTasks.map((task) => updateTaskInDB(task.id, { category: fallbackGroup.name }))
  );
  await deleteGroupFromDB(groupToDelete.id);

  tasks = tasks.map((task) =>
    task.category === groupToDelete.name ? { ...task, category: fallbackGroup.name } : task
  );
  groups = groups.filter((group) => group.id !== groupToDelete.id);
  collapsedGroups.delete(groupToDelete.name);
  closeConfirmModal();
  render();
});

document.addEventListener("click", async (event) => {
  const addTaskButton = event.target.closest(".add-task-inline-button");
  const deleteTaskButton = event.target.closest(".task-delete");
  const groupDeleteButton = event.target.closest(".group-delete-button");
  const groupToggleButton = event.target.closest(".group-toggle-button");

  if (groupToggleButton) {
    const section = groupToggleButton.closest(".group-table-section");
    const groupName = section?.dataset.groupName;

    if (!groupName) {
      return;
    }

    if (collapsedGroups.has(groupName)) {
      collapsedGroups.delete(groupName);
    } else {
      collapsedGroups.add(groupName);
    }

    render();
    return;
  }

  if (groupDeleteButton) {
    const section = groupDeleteButton.closest(".group-table-section");
    const groupName = section?.dataset.groupName;
    const fallbackGroup = groups.find((group) => group.name !== groupName)?.name || "";

    if (!groupName || groups.length === 1) {
      return;
    }

    pendingGroupDelete = groupName;
    confirmModalText.textContent = `Are you sure you want to delete this group? Tasks will be moved to "${fallbackGroup}".`;
    confirmModal.hidden = false;
    return;
  }

  if (addTaskButton) {
    const row = addTaskButton.closest(".add-task-row");
    const groupName = row?.dataset.groupName;
    const titleInput = row?.querySelector(".new-task-title");
    const statusInput = row?.querySelector(".new-task-status");
    const dueDateInput = row?.querySelector(".new-task-due-date");
    const priorityInput = row?.querySelector(".new-task-priority");
    const title = titleInput?.value.trim() || "";

    if (!row || !groupName || !title) {
      titleInput?.focus();
      return;
    }

    const newTask = {
      title,
      dueDate: dueDateInput?.value || "",
      priority: priorityInput?.value || "medium",
      category: groupName,
      status: statusInput?.value || "todo",
      createdAt: new Date().toISOString()
    };

    const id = await addTaskToDB(newTask);
    tasks.push({ id, ...newTask });
    render();
    return;
  }

  if (deleteTaskButton) {
    const row = deleteTaskButton.closest(".task-row");
    const taskId = row?.dataset.taskId;

    if (!taskId) {
      return;
    }

    await deleteTaskFromDB(taskId);
    tasks = tasks.filter((task) => task.id !== taskId);
    render();
  }
});

document.addEventListener("keydown", (event) => {
  const groupNameField = event.target.closest(".group-name-input");
  const titleInput = event.target.closest(".new-task-title");

  if (groupNameField && event.key === "Enter") {
    event.preventDefault();
    groupNameField.blur();
    return;
  }

  if (!titleInput || event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  titleInput.closest(".add-task-row")?.querySelector(".add-task-inline-button")?.click();
});

document.addEventListener("blur", async (event) => {
  const groupNameField = event.target.closest(".group-name-input");

  if (!groupNameField) {
    return;
  }

  const section = groupNameField.closest(".group-table-section");
  const oldName = section?.dataset.groupName;
  const nextName = groupNameField.value.trim();

  if (!oldName) {
    return;
  }

  if (!nextName) {
    groupNameField.value = oldName;
    return;
  }

  const duplicateExists = groups.some(
    (group) => group.name.toLowerCase() === nextName.toLowerCase() && group.name !== oldName
  );

  if (duplicateExists) {
    groupNameField.value = oldName;
    return;
  }

  if (nextName === oldName) {
    return;
  }

  const groupToRename = groups.find((group) => group.name === oldName);

  if (!groupToRename) {
    return;
  }

  await updateGroupInDB(groupToRename.id, { name: nextName });

  const affectedTasks = tasks.filter((task) => task.category === oldName);
  await Promise.all(
    affectedTasks.map((task) => updateTaskInDB(task.id, { category: nextName }))
  );

  groups = groups.map((group) =>
    group.id === groupToRename.id ? { ...group, name: nextName } : group
  );
  tasks = tasks.map((task) =>
    task.category === oldName ? { ...task, category: nextName } : task
  );

  if (collapsedGroups.has(oldName)) {
    collapsedGroups.delete(oldName);
    collapsedGroups.add(nextName);
  }

  render();
}, true);

document.addEventListener("change", async (event) => {
  const groupHeaderColorInput = event.target.closest(".group-header-color-input");
  const taskStatusSelect = event.target.closest(".task-status-select");
  const dueDateInput = event.target.closest(".task-due-date-input");

  if (groupHeaderColorInput) {
    const section = groupHeaderColorInput.closest(".group-table-section");
    const groupName = section?.dataset.groupName;
    const groupToUpdate = groups.find((group) => group.name === groupName);

    if (!groupToUpdate) {
      return;
    }

    await updateGroupInDB(groupToUpdate.id, { color: groupHeaderColorInput.value });
    groups = groups.map((group) =>
      group.id === groupToUpdate.id ? { ...group, color: groupHeaderColorInput.value } : group
    );
    render();
    return;
  }

  if (dueDateInput) {
    const row = dueDateInput.closest(".task-row");
    const taskId = row?.dataset.taskId;

    if (!taskId) {
      return;
    }

    await updateTaskInDB(taskId, { dueDate: dueDateInput.value });
    tasks = tasks.map((task) =>
      task.id === taskId ? { ...task, dueDate: dueDateInput.value } : task
    );
    render();
    return;
  }

  if (taskStatusSelect) {
    const row = taskStatusSelect.closest(".task-row");
    const taskId = row?.dataset.taskId;

    if (!taskId) {
      return;
    }

    await updateTaskInDB(taskId, { status: taskStatusSelect.value });
    tasks = tasks.map((task) =>
      task.id === taskId ? { ...task, status: taskStatusSelect.value } : task
    );
    render();
  }
});

init();

async function init() {
  tasks = await loadTasks();
  groups = await loadGroups();

  if (groups.length === 0) {
    const defaults = [
      { name: "Poster", color: "#2563eb" },
      { name: "Released", color: "#10b981" }
    ];
    groups = await Promise.all(
      defaults.map(async (group) => ({
        id: await addGroupToDB(group),
        ...group
      }))
    );
  }

  await syncGroupsWithTasks();
  render();
}

async function loadTasks() {
  const snapshot = await getDocs(TASKS_REF);

  return snapshot.docs.map((taskDoc) => ({
    id: taskDoc.id,
    ...taskDoc.data()
  }));
}

async function loadGroups() {
  const snapshot = await getDocs(GROUPS_REF);

  return snapshot.docs.map((groupDoc) => ({
    id: groupDoc.id,
    ...groupDoc.data()
  }));
}

async function addTaskToDB(task) {
  const ref = await addDoc(TASKS_REF, task);
  return ref.id;
}

async function addGroupToDB(group) {
  const ref = await addDoc(GROUPS_REF, group);
  return ref.id;
}

async function deleteTaskFromDB(id) {
  await deleteDoc(doc(db, "tasks", id));
}

async function deleteGroupFromDB(id) {
  await deleteDoc(doc(db, "groups", id));
}

async function updateTaskInDB(id, data) {
  await updateDoc(doc(db, "tasks", id), data);
}

async function updateGroupInDB(id, data) {
  await updateDoc(doc(db, "groups", id), data);
}

function render() {
  const visibleTasks = getVisibleTasks();
  groupedTables.innerHTML = "";

  groups.forEach((group) => {
    const groupTasks = visibleTasks.filter((task) => task.category === group.name);
    groupedTables.append(createGroupSection(group, groupTasks));
  });

  emptyState.hidden = groups.length > 0;
  updateCounters();
  renderSummaryChart();
}

function getVisibleTasks() {
  const query = searchInput.value.trim().toLowerCase();
  const statusFilter = filterStatus.value;
  const sortMode = sortSelect.value;

  const filteredTasks = tasks.filter((task) => {
    const matchesQuery = !query || [task.title, task.category].join(" ").toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;

    return matchesQuery && matchesStatus;
  });

  return filteredTasks.sort((left, right) => compareTasks(left, right, sortMode));
}

function compareTasks(left, right, sortMode) {
  if (sortMode === "workflow") {
    const statusOrder = workflowStatusWeight(left.status) - workflowStatusWeight(right.status);

    if (statusOrder !== 0) {
      return statusOrder;
    }

    return compareDates(left.createdAt, right.createdAt);
  }

  if (sortMode === "priority") {
    return priorityWeight(left.priority) - priorityWeight(right.priority);
  }

  if (sortMode === "due-date") {
    if (!left.dueDate && !right.dueDate) {
      return compareDates(right.createdAt, left.createdAt);
    }

    if (!left.dueDate) {
      return 1;
    }

    if (!right.dueDate) {
      return -1;
    }

    return compareDates(left.dueDate, right.dueDate);
  }

  if (sortMode === "status") {
    return statusWeight(left.status) - statusWeight(right.status);
  }

  return compareDates(left.createdAt, right.createdAt);
}

function compareDates(left, right) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function priorityWeight(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 3;
}

function statusWeight(status) {
  return { todo: 0, doing: 1, revision: 2, done: 3 }[status] ?? 4;
}

function workflowStatusWeight(status) {
  return { doing: 0, revision: 1, todo: 2, done: 3 }[status] ?? 4;
}

function createTaskRow(task) {
  const fragment = taskTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".task-row");
  const badge = fragment.querySelector(".priority-badge");
  const category = fragment.querySelector(".task-category");
  const title = fragment.querySelector(".task-title");
  const dueDate = fragment.querySelector(".task-due-date-input");
  const statusSelect = fragment.querySelector(".task-status-select");
  const group = getGroupByName(task.category);

  row.dataset.taskId = task.id;
  row.classList.add(`status-${task.status}`);
  badge.textContent = capitalize(task.priority);
  badge.classList.add(task.priority);
  category.textContent = task.category;

  if (group) {
    category.style.backgroundColor = `${group.color}18`;
    category.style.borderColor = `${group.color}44`;
    category.style.color = group.color;
  }

  title.textContent = task.title;
  dueDate.value = task.dueDate || "";
  statusSelect.value = task.status;

  return fragment;
}

function createGroupSection(group, groupTasks) {
  const fragment = groupTableTemplate.content.cloneNode(true);
  const section = fragment.querySelector(".group-table-section");
  const titleInput = fragment.querySelector(".group-name-input");
  const colorInput = fragment.querySelector(".group-header-color-input");
  const count = fragment.querySelector(".group-table-count");
  const body = fragment.querySelector(".task-table-body");
  const content = fragment.querySelector(".group-table-content");
  const toggleButton = fragment.querySelector(".group-toggle-button");
  const isCollapsed = collapsedGroups.has(group.name);

  section.dataset.groupName = group.name;
  section.style.setProperty("--group-accent", group.color);
  titleInput.value = group.name;
  colorInput.value = group.color;
  count.textContent = `${groupTasks.length} task${groupTasks.length === 1 ? "" : "s"}`;
  toggleButton.textContent = isCollapsed ? "+" : "-";
  toggleButton.setAttribute("aria-label", isCollapsed ? `Show ${group.name} group` : `Hide ${group.name} group`);
  content.hidden = isCollapsed;

  if (!isCollapsed) {
    groupTasks.forEach((task) => {
      body.append(createTaskRow(task));
    });
    body.append(createAddTaskRow(group.name));
  }

  return fragment;
}

function createAddTaskRow(groupName) {
  const fragment = addTaskRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".add-task-row");
  const category = fragment.querySelector(".new-task-category");

  row.dataset.groupName = groupName;
  category.textContent = groupName;

  return fragment;
}

function updateCounters() {
  counters.total.textContent = String(tasks.length);
  counters.active.textContent = String(
    tasks.filter((task) => task.status === "doing" || task.status === "revision").length
  );
  counters.done.textContent = String(tasks.filter((task) => task.status === "done").length);
  counters.priority.textContent = String(tasks.filter((task) => task.priority === "high").length);
}

function getGroupByName(name) {
  return groups.find((group) => group.name === name);
}

async function syncGroupsWithTasks() {
  const missingGroupNames = [...new Set(tasks.map((task) => task.category))].filter(
    (name) => name && !groups.some((group) => group.name === name)
  );

  if (missingGroupNames.length === 0) {
    return;
  }

  const createdGroups = await Promise.all(
    missingGroupNames.map(async (name) => ({
      id: await addGroupToDB({ name, color: "#2563eb" }),
      name,
      color: "#2563eb"
    }))
  );

  groups = [...groups, ...createdGroups];
}

function closeConfirmModal() {
  pendingGroupDelete = null;
  confirmModal.hidden = true;
}

function renderSummaryChart() {
  if (!summaryChart) {
    return;
  }

  const context = summaryChart.getContext("2d");

  if (!context) {
    return;
  }

  const width = summaryChart.clientWidth || 640;
  const height = 220;
  const scale = window.devicePixelRatio || 1;

  summaryChart.width = Math.floor(width * scale);
  summaryChart.height = Math.floor(height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);

  const chartData = [
    { label: "To do", value: tasks.filter((task) => task.status === "todo").length, color: "#cbd5e1" },
    { label: "Doing", value: tasks.filter((task) => task.status === "doing").length, color: "#f4c84f" },
    { label: "Revision", value: tasks.filter((task) => task.status === "revision").length, color: "#60a5fa" },
    { label: "Done", value: tasks.filter((task) => task.status === "done").length, color: "#34a853" }
  ];
  const maxValue = Math.max(...chartData.map((item) => item.value), 1);
  const left = 44;
  const right = 20;
  const top = 24;
  const bottom = 42;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const barWidth = innerWidth / (chartData.length * 1.4);
  const gap = barWidth * 0.4;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "#dbe3ee";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, top + innerHeight);
  context.lineTo(width - right, top + innerHeight);
  context.stroke();

  context.font = "12px Manrope";
  context.fillStyle = "#6b7280";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let step = 0; step <= maxValue; step += Math.max(1, Math.ceil(maxValue / 4))) {
    const y = top + innerHeight - (step / maxValue) * innerHeight;
    context.fillText(String(step), left - 8, y);
  }

  context.textAlign = "center";
  context.textBaseline = "top";

  chartData.forEach((item, index) => {
    const x = left + gap + index * (barWidth + gap);
    const barHeight = (item.value / maxValue) * innerHeight;
    const y = top + innerHeight - barHeight;

    context.fillStyle = item.color;
    context.fillRect(x, y, barWidth, Math.max(barHeight, 4));
    context.fillStyle = "#1f2937";
    context.font = "700 12px Manrope";
    context.textBaseline = "bottom";
    context.fillText(String(item.value), x + barWidth / 2, y - 6);
    context.fillStyle = "#6b7280";
    context.font = "12px Manrope";
    context.textBaseline = "top";
    context.fillText(item.label, x + barWidth / 2, top + innerHeight + 10);
  });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
