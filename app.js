import { firebaseConfig } from "./firebase-config.js";

// One fixed shared space for our home. Everyone who opens the app (even the
// plain URL with no ?list= code) lands on the SAME lists automatically — no
// link to share. A ?list= code in the URL still overrides it if ever needed.
const DEFAULT_BOARD_ID = "ourhome-35863f257f144d8c93c9e0a439b2fba1";
const themeKey = "our-buy-list-theme";
const firebaseVersion = "12.7.0";

const form = document.querySelector("#item-form");
const itemName = document.querySelector("#item-name");
const itemQuantity = document.querySelector("#item-quantity");
const itemCategory = document.querySelector("#item-category");
const itemList = document.querySelector("#item-list");
const itemTemplate = document.querySelector("#item-template");
const listTabTemplate = document.querySelector("#list-tab-template");
const listsTabs = document.querySelector("#lists-tabs");
const addListButton = document.querySelector("#add-list");
const renameListButton = document.querySelector("#rename-list");
const listTitle = document.querySelector("#list-title");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = emptyState.querySelector("h3");
const emptyText = emptyState.querySelector("p");
const emptyAction = document.querySelector("#empty-action");
const remainingCount = document.querySelector("#remaining-count");
const itemCountBox = document.querySelector(".item-count");
const clearBoughtButton = document.querySelector("#clear-bought");
const filterButtons = document.querySelectorAll(".filter");
const filterPill = document.querySelector(".filter-pill");
const syncStatus = document.querySelector("#sync-status");
const themeToggle = document.querySelector("#theme-toggle");
const shareButton = document.querySelector("#share-button");
const installButton = document.querySelector("#install-button");
const toast = document.querySelector("#toast");

const dialog = document.querySelector("#list-dialog");
const dialogForm = document.querySelector("#list-form");
const dialogTitle = document.querySelector("#dialog-title");
const listNameInput = document.querySelector("#list-name-input");
const dialogDelete = document.querySelector("#dialog-delete");
const dialogCancel = document.querySelector("#dialog-cancel");

// The shared space holding all of this couple's named lists. Defaults to one
// fixed space so both phones see the same lists with no link to share.
const boardId = getBoardId();
const listsKey = `our-buy-list-lists:${boardId}`;
const activeKey = `our-buy-list-active:${boardId}`;
const itemsKeyFor = (listId) => `our-buy-list-items:${boardId}:${listId}`;

let lists = loadLists();
let activeListId = localStorage.getItem(activeKey) || lists[0]?.id || null;
let items = activeListId ? loadItems(activeListId) : [];
let activeFilter = "all";
let online = null;
let itemsUnsub = null;
let subscribedListId = null;
let knownIds = new Set(items.map((item) => item.id));
let installPrompt = null;
let toastTimer = null;
let dialogMode = "create";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* -------------------- Storage -------------------- */
function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function loadLists() {
  return readJSON(listsKey, []);
}

function saveLists() {
  localStorage.setItem(listsKey, JSON.stringify(lists));
}

function loadItems(listId) {
  return readJSON(itemsKeyFor(listId), []);
}

function saveItems() {
  if (activeListId) localStorage.setItem(itemsKeyFor(activeListId), JSON.stringify(items));
}

function getBoardId() {
  const param = new URL(window.location.href).searchParams.get("list");
  const rawId = param || DEFAULT_BOARD_ID;
  return rawId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
}

function activeList() {
  return lists.find((list) => list.id === activeListId) || null;
}

/* -------------------- Theme -------------------- */
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function currentTheme() {
  const saved = localStorage.getItem(themeKey);
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

applyTheme(localStorage.getItem(themeKey));

themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(themeKey, next);
  applyTheme(next);
  buzz(8);
});

/* -------------------- Small helpers -------------------- */
function buzz(ms) {
  if (!prefersReducedMotion && navigator.vibrate) navigator.vibrate(ms);
}

function setSyncStatus(message, state = "") {
  syncStatus.textContent = message;
  syncStatus.dataset.state = state;
}

function showToast(message, actionLabel, onAction) {
  clearTimeout(toastTimer);
  toast.replaceChildren(document.createTextNode(message));

  if (actionLabel && onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", () => {
      hideToast();
      onAction();
    });
    toast.append(button);
  }

  toast.classList.add("show");
  toastTimer = setTimeout(hideToast, 4200);
}

function hideToast() {
  toast.classList.remove("show");
}

function moveFilterPill() {
  const active = document.querySelector(".filter.active");
  if (!active) return;
  filterPill.style.width = `${active.offsetWidth}px`;
  filterPill.style.transform = `translateX(${active.offsetLeft - 5}px)`;
}

/* -------------------- Render: list tabs -------------------- */
function renderListTabs() {
  listsTabs.replaceChildren();

  lists.forEach((list) => {
    const tab = listTabTemplate.content.firstElementChild.cloneNode(true);
    tab.textContent = list.name;
    tab.dataset.id = list.id;
    if (list.id === activeListId) tab.setAttribute("aria-current", "true");
    listsTabs.append(tab);
  });

  const current = activeList();
  document.body.classList.toggle("no-list", lists.length === 0);
  renameListButton.hidden = !current;
  listTitle.textContent = current ? current.name : "Your lists";

  // keep the active tab in view
  const activeTab = listsTabs.querySelector('[aria-current="true"]');
  if (activeTab) activeTab.scrollIntoView({ inline: "nearest", block: "nearest" });
}

/* -------------------- Render: items -------------------- */
function visibleItems() {
  if (activeFilter === "active") return items.filter((item) => !item.bought);
  if (activeFilter === "bought") return items.filter((item) => item.bought);
  return items;
}

function render() {
  const filteredItems = visibleItems();
  const fragment = document.createDocumentFragment();
  let newCount = 0;

  filteredItems.forEach((item) => {
    const listItem = itemTemplate.content.firstElementChild.cloneNode(true);
    const surface = listItem.querySelector(".item-surface");

    listItem.dataset.id = item.id;
    listItem.classList.toggle("bought", item.bought);
    surface.dataset.cat = item.category;
    listItem.querySelector(".item-title").textContent = item.name;
    listItem.querySelector(".item-qty").textContent = `${item.quantity || "1"} ·`;
    listItem.querySelector(".item-cat").textContent = item.category;
    listItem.querySelector(".check-button").setAttribute(
      "aria-label",
      item.bought ? `Mark ${item.name} as not bought` : `Mark ${item.name} as bought`,
    );

    if (!knownIds.has(item.id) && !prefersReducedMotion) {
      listItem.classList.add("entering");
      listItem.style.setProperty("--i", newCount++);
      listItem.addEventListener("animationend", () => listItem.classList.remove("entering"), {
        once: true,
      });
    }

    fragment.append(listItem);
  });

  itemList.replaceChildren(fragment);
  knownIds = new Set(items.map((item) => item.id));

  remainingCount.textContent = items.filter((item) => !item.bought).length;
  clearBoughtButton.disabled = !items.some((item) => item.bought);
  emptyState.classList.toggle("hidden", filteredItems.length > 0);

  if (lists.length === 0) {
    emptyTitle.textContent = "No lists yet";
    emptyText.textContent = "Create your first list to get started.";
    emptyAction.hidden = false;
  } else if (items.length === 0) {
    emptyTitle.textContent = "This list is empty";
    emptyText.textContent = "Add the first thing you need above.";
    emptyAction.hidden = true;
  } else {
    emptyTitle.textContent = "Nothing here";
    emptyText.textContent = "Try another filter.";
    emptyAction.hidden = true;
  }
}

function bumpCount() {
  if (prefersReducedMotion) return;
  itemCountBox.classList.remove("bump");
  void itemCountBox.offsetWidth;
  itemCountBox.classList.add("bump");
  itemCountBox.addEventListener("transitionend", () => itemCountBox.classList.remove("bump"), {
    once: true,
  });
}

/* -------------------- Active list selection -------------------- */
function setActiveList(id) {
  activeListId = id;
  if (id) localStorage.setItem(activeKey, id);
  else localStorage.removeItem(activeKey);

  knownIds = new Set(); // let the new list's items animate in
  items = id ? loadItems(id) : [];
  renderListTabs();
  render();
  moveFilterPill();

  if (online) subscribeItems(id);
}

/* -------------------- Firebase -------------------- */
function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => value && !value.startsWith("PASTE_"));
}

function listsCol() {
  return online.fb.collection(online.db, "boards", boardId, "lists");
}

function itemsCol(listId) {
  return online.fb.collection(online.db, "boards", boardId, "lists", listId, "items");
}

function subscribeItems(listId) {
  if (subscribedListId === listId && itemsUnsub) return;
  if (itemsUnsub) itemsUnsub();
  itemsUnsub = null;
  subscribedListId = listId;

  if (!listId) {
    items = [];
    render();
    return;
  }

  const { fb } = online;
  itemsUnsub = fb.onSnapshot(
    fb.query(itemsCol(listId), fb.orderBy("createdAt", "desc")),
    (snapshot) => {
      items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      saveItems();
      render();
    },
    () => setSyncStatus("Cannot sync · Check Firebase setup", "error"),
  );
}

async function connectToFirebase() {
  if (!isFirebaseConfigured()) {
    setSyncStatus("Saved on this device");
    return;
  }

  setSyncStatus("Connecting...", "pending");

  try {
    const { initializeApp } = await import(
      `https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js`
    );
    const fb = await import(
      `https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-firestore.js`
    );
    const app = initializeApp(firebaseConfig);
    const db = fb.getFirestore(app);
    online = { fb, db };

    fb.onSnapshot(
      fb.query(listsCol(), fb.orderBy("createdAt", "asc")),
      (snapshot) => {
        lists = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        saveLists();

        if (!activeListId || !lists.some((list) => list.id === activeListId)) {
          activeListId = lists[0]?.id || null;
          if (activeListId) localStorage.setItem(activeKey, activeListId);
        }

        renderListTabs();
        subscribeItems(activeListId);
        setSyncStatus("Shared lists · Live", "online");
      },
      () => setSyncStatus("Cannot sync · Check Firebase setup", "error"),
    );
  } catch {
    setSyncStatus("Offline · Saved on this device", "error");
  }
}

/* -------------------- List CRUD -------------------- */
async function createList(name) {
  const list = { id: crypto.randomUUID(), name, createdAt: Date.now() };

  if (online) {
    await online.fb.setDoc(online.fb.doc(listsCol(), list.id), {
      name: list.name,
      createdAt: list.createdAt,
    });
  } else {
    lists.push(list);
    saveLists();
  }
  setActiveList(list.id);
  buzz(8);
}

async function renameList(id, name) {
  lists = lists.map((list) => (list.id === id ? { ...list, name } : list));
  if (online) {
    await online.fb.updateDoc(online.fb.doc(listsCol(), id), { name });
  } else {
    saveLists();
    renderListTabs();
  }
}

async function deleteList(id) {
  const remaining = lists.filter((list) => list.id !== id);

  if (online) {
    const snapshot = await online.fb.getDocs(itemsCol(id));
    await Promise.all(snapshot.docs.map((doc) => online.fb.deleteDoc(doc.ref)));
    await online.fb.deleteDoc(online.fb.doc(listsCol(), id));
  } else {
    localStorage.removeItem(itemsKeyFor(id));
    lists = remaining;
    saveLists();
  }

  if (activeListId === id) setActiveList(remaining[0]?.id || null);
  buzz(12);
}

/* -------------------- Item CRUD -------------------- */
function itemFields(item) {
  return {
    name: item.name,
    quantity: item.quantity,
    category: item.category,
    bought: item.bought,
    createdAt: item.createdAt,
  };
}

async function createItem(item) {
  if (!activeListId) return;
  if (online) {
    await online.fb.setDoc(online.fb.doc(itemsCol(activeListId), item.id), itemFields(item));
    return;
  }
  items.unshift(item);
  saveItems();
  render();
}

async function addItem(name, quantity, category) {
  await createItem({
    id: crypto.randomUUID(),
    name,
    quantity,
    category,
    bought: false,
    createdAt: Date.now(),
  });
}

async function toggleItem(id) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return;
  if (!item.bought) buzz(12);

  if (online) {
    await online.fb.updateDoc(online.fb.doc(itemsCol(activeListId), id), { bought: !item.bought });
    return;
  }
  items = items.map((candidate) =>
    candidate.id === id ? { ...candidate, bought: !candidate.bought } : candidate,
  );
  saveItems();
  render();
}

async function removeItem(id) {
  if (online) {
    await online.fb.deleteDoc(online.fb.doc(itemsCol(activeListId), id));
    return;
  }
  items = items.filter((item) => item.id !== id);
  saveItems();
  render();
}

async function deleteItem(id) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return;
  const snapshot = { ...item };

  buzz(10);
  await removeItem(id);

  showToast(`Removed "${snapshot.name}"`, "Undo", () => {
    knownIds.delete(snapshot.id);
    createItem(snapshot);
  });
}

/* -------------------- Swipe to delete -------------------- */
const SWIPE_THRESHOLD = 90;
let drag = null;

itemList.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType === "mouse") return;
    const surface = event.target.closest(".item-surface");
    if (!surface) return;
    if (event.target.closest(".check-button") || event.target.closest(".delete-button")) return;

    const listItem = surface.closest(".list-item");
    drag = { listItem, surface, startX: event.clientX, startY: event.clientY, dx: 0, locked: null };
  },
  { passive: true },
);

itemList.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;

  if (drag.locked === null) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    drag.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (drag.locked === "x") drag.listItem.classList.add("dragging");
  }
  if (drag.locked !== "x") return;

  drag.dx = Math.min(0, dx);
  drag.surface.style.transform = `translateX(${drag.dx}px)`;
  drag.listItem.classList.toggle("will-delete", drag.dx < -SWIPE_THRESHOLD);
});

function endDrag() {
  if (!drag) return;
  const { listItem, surface, dx, locked } = drag;
  drag = null;

  listItem.classList.remove("dragging");
  if (locked !== "x") return;

  if (dx < -SWIPE_THRESHOLD) {
    surface.style.transform = "translateX(-110%)";
    listItem.classList.add("leaving");
    listItem.addEventListener("animationend", () => deleteItem(listItem.dataset.id), { once: true });
  } else {
    surface.style.transform = "";
    listItem.classList.remove("will-delete");
  }
}

itemList.addEventListener("pointerup", endDrag);
itemList.addEventListener("pointercancel", endDrag);

/* -------------------- Click delegation -------------------- */
itemList.addEventListener("click", (event) => {
  const listItem = event.target.closest(".list-item");
  if (!listItem) return;
  const { id } = listItem.dataset;

  if (event.target.closest(".check-button")) toggleItem(id);
  else if (event.target.closest(".delete-button")) deleteItem(id);
});

listsTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".list-tab");
  if (!tab || tab.dataset.id === activeListId) return;
  setActiveList(tab.dataset.id);
});

/* -------------------- List dialog -------------------- */
function openDialog(mode) {
  dialogMode = mode;
  const current = activeList();
  dialogTitle.textContent = mode === "edit" ? "Edit list" : "New list";
  listNameInput.value = mode === "edit" && current ? current.name : "";
  dialogDelete.hidden = mode !== "edit";
  dialog.showModal();
  listNameInput.focus();
  listNameInput.select();
}

addListButton.addEventListener("click", () => openDialog("create"));
renameListButton.addEventListener("click", () => openDialog("edit"));
emptyAction.addEventListener("click", () => openDialog("create"));
dialogCancel.addEventListener("click", () => dialog.close());

dialogForm.addEventListener("submit", (event) => {
  const name = listNameInput.value.trim();
  if (!name) {
    event.preventDefault();
    listNameInput.focus();
    return;
  }
  // method="dialog" closes the dialog automatically after this handler.
  if (dialogMode === "edit") renameList(activeListId, name);
  else createList(name);
});

dialogDelete.addEventListener("click", () => {
  const current = activeList();
  if (!current) return;
  if (!confirm(`Delete "${current.name}" and everything in it?`)) return;
  dialog.close();
  deleteList(current.id);
});

/* -------------------- Form & filters -------------------- */
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = itemName.value.trim();
  const quantity = itemQuantity.value.trim();

  if (!name) {
    itemName.focus();
    return;
  }

  buzz(8);
  bumpCount();
  await addItem(name, quantity, itemCategory.value);
  form.reset();
  itemName.focus();
});

clearBoughtButton.addEventListener("click", async () => {
  const boughtItems = items.filter((item) => item.bought);
  if (boughtItems.length === 0) return;

  buzz(10);
  if (online) {
    await Promise.all(boughtItems.map((item) => removeItem(item.id)));
  } else {
    items = items.filter((item) => !item.bought);
    saveItems();
    render();
  }
  showToast(`Cleared ${boughtItems.length} bought item${boughtItems.length > 1 ? "s" : ""}`);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((filter) => filter.classList.remove("active"));
    button.classList.add("active");
    moveFilterPill();
    render();
  });
});

/* -------------------- Share & install -------------------- */
shareButton.addEventListener("click", async () => {
  const url = window.location.href;
  const shareData = { title: "Our Buy List", text: "Here are our shared shopping lists:", url };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
  } catch {
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied to clipboard");
  } catch {
    showToast("Copy this page's link to share");
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  showToast("Installed — find it on your home screen");
});

/* -------------------- Passcode gate -------------------- */
const PASSCODE = "2207";
const unlockKey = "our-buy-list-unlocked";
const lockScreen = document.querySelector("#lock-screen");
const lockCard = document.querySelector(".lock-card");
const pinInput = document.querySelector("#pin-input");
const pinDots = document.querySelectorAll(".pin-dots span");

let appStarted = false;

function startApp() {
  if (appStarted) return;
  appStarted = true;
  renderListTabs();
  render();
  moveFilterPill();
  connectToFirebase();
}

function unlock() {
  lockScreen.classList.add("hidden");
  startApp();
}

function updateDots(count) {
  pinDots.forEach((dot, i) => dot.classList.toggle("filled", i < count));
}

if (localStorage.getItem(unlockKey) === "yes") {
  unlock();
} else {
  pinInput.focus();
  lockCard.addEventListener("click", () => pinInput.focus());

  pinInput.addEventListener("input", () => {
    const value = pinInput.value.replace(/\D/g, "").slice(0, 4);
    pinInput.value = value;
    updateDots(value.length);
    if (value.length < 4) return;

    if (value === PASSCODE) {
      localStorage.setItem(unlockKey, "yes");
      buzz(8);
      unlock();
    } else {
      buzz(30);
      lockCard.classList.add("shake");
      setTimeout(() => {
        pinInput.value = "";
        updateDots(0);
        lockCard.classList.remove("shake");
        pinInput.focus();
      }, 440);
    }
  });
}

/* -------------------- Boot -------------------- */
window.addEventListener("resize", moveFilterPill);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
