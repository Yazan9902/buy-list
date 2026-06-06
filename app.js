import { firebaseConfig } from "./firebase-config.js";

const listIdKey = "our-buy-list-id";
const firebaseVersion = "12.7.0";

const form = document.querySelector("#item-form");
const itemName = document.querySelector("#item-name");
const itemQuantity = document.querySelector("#item-quantity");
const itemCategory = document.querySelector("#item-category");
const itemList = document.querySelector("#item-list");
const itemTemplate = document.querySelector("#item-template");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = emptyState.querySelector("h3");
const emptyText = emptyState.querySelector("p");
const remainingCount = document.querySelector("#remaining-count");
const clearBoughtButton = document.querySelector("#clear-bought");
const filterButtons = document.querySelectorAll(".filter");
const syncStatus = document.querySelector("#sync-status");

// Resolve the list id once. It lives in the shareable ?list= URL and is the
// only thing tying both phones to the same list, so the local cache is keyed
// to it — switching lists never shows another list's stale items.
const listId = getListId();
const storageKey = `our-buy-list-items:${listId}`;

let items = loadItems();
let activeFilter = "all";
let onlineStore = null;

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(storageKey, JSON.stringify(items));
}

function getListId() {
  const url = new URL(window.location.href);
  let rawId = url.searchParams.get("list");

  if (!rawId) {
    rawId = localStorage.getItem(listIdKey) || crypto.randomUUID();
  }

  const cleanId = rawId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
  localStorage.setItem(listIdKey, cleanId);

  // Keep the sanitized id visible in the URL so it can be shared as-is.
  if (url.searchParams.get("list") !== cleanId) {
    url.searchParams.set("list", cleanId);
    window.history.replaceState({}, "", url);
  }

  return cleanId;
}

function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(
    (value) => value && !value.startsWith("PASTE_"),
  );
}

function setSyncStatus(message, state = "") {
  syncStatus.textContent = message;
  syncStatus.dataset.state = state;
}

function visibleItems() {
  if (activeFilter === "active") {
    return items.filter((item) => !item.bought);
  }

  if (activeFilter === "bought") {
    return items.filter((item) => item.bought);
  }

  return items;
}

function render() {
  const filteredItems = visibleItems();

  const fragment = document.createDocumentFragment();

  filteredItems.forEach((item) => {
    const listItem = itemTemplate.content.firstElementChild.cloneNode(true);

    listItem.dataset.id = item.id;
    listItem.classList.toggle("bought", item.bought);
    listItem.querySelector(".item-title").textContent = item.name;
    listItem.querySelector(".item-meta").textContent =
      `${item.quantity || "1"} · ${item.category}`;
    listItem.querySelector(".check-button").setAttribute(
      "aria-label",
      item.bought ? `Mark ${item.name} as not bought` : `Mark ${item.name} as bought`,
    );

    fragment.append(listItem);
  });

  itemList.replaceChildren(fragment);

  remainingCount.textContent = items.filter((item) => !item.bought).length;
  clearBoughtButton.disabled = !items.some((item) => item.bought);
  emptyState.classList.toggle("hidden", filteredItems.length > 0);

  if (filteredItems.length === 0 && items.length > 0) {
    emptyTitle.textContent = "Nothing here";
    emptyText.textContent = "Try another filter.";
  } else {
    emptyTitle.textContent = "Your list is empty";
    emptyText.textContent = "Add the first thing you need above.";
  }
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
    const firestore = await import(
      `https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-firestore.js`
    );
    const app = initializeApp(firebaseConfig);
    const db = firestore.getFirestore(app);
    const itemsCollection = firestore.collection(db, "lists", listId, "items");

    onlineStore = { firestore, itemsCollection };

    firestore.onSnapshot(
      firestore.query(itemsCollection, firestore.orderBy("createdAt", "desc")),
      (snapshot) => {
        items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        saveItems();
        render();
        setSyncStatus("Shared list · Live", "online");
      },
      () => setSyncStatus("Cannot sync · Check Firebase setup", "error"),
    );
  } catch {
    setSyncStatus("Offline · Saved on this device", "error");
  }
}

async function addItem(name, quantity, category) {
  const item = {
    id: crypto.randomUUID(),
    name,
    quantity,
    category,
    bought: false,
    createdAt: Date.now(),
  };

  if (onlineStore) {
    const { firestore, itemsCollection } = onlineStore;
    await firestore.setDoc(firestore.doc(itemsCollection, item.id), {
      name: item.name,
      quantity: item.quantity,
      category: item.category,
      bought: item.bought,
      createdAt: item.createdAt,
    });
    return;
  }

  items.unshift(item);
  saveItems();
  render();
}

async function toggleItem(id) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return;

  if (onlineStore) {
    const { firestore, itemsCollection } = onlineStore;
    await firestore.updateDoc(firestore.doc(itemsCollection, id), {
      bought: !item.bought,
    });
    return;
  }

  items = items.map((candidate) =>
    candidate.id === id ? { ...candidate, bought: !candidate.bought } : candidate,
  );
  saveItems();
  render();
}

async function deleteItem(id) {
  if (onlineStore) {
    const { firestore, itemsCollection } = onlineStore;
    await firestore.deleteDoc(firestore.doc(itemsCollection, id));
    return;
  }

  items = items.filter((item) => item.id !== id);
  saveItems();
  render();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = itemName.value.trim();
  const quantity = itemQuantity.value.trim();

  if (!name) {
    itemName.focus();
    return;
  }

  await addItem(name, quantity, itemCategory.value);
  form.reset();
  itemName.focus();
});

// One delegated listener for the whole list, instead of re-binding two
// handlers per item on every render.
itemList.addEventListener("click", (event) => {
  const listItem = event.target.closest(".list-item");
  if (!listItem) return;

  const { id } = listItem.dataset;

  if (event.target.closest(".check-button")) {
    toggleItem(id);
  } else if (event.target.closest(".delete-button")) {
    deleteItem(id);
  }
});

clearBoughtButton.addEventListener("click", async () => {
  const boughtItems = items.filter((item) => item.bought);

  if (onlineStore) {
    await Promise.all(boughtItems.map((item) => deleteItem(item.id)));
    return;
  }

  items = items.filter((item) => !item.bought);
  saveItems();
  render();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((filter) => filter.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

render();
connectToFirebase();
