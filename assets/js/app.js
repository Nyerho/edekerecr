let products = [];
let cart = [];
let salesHistory = [];
let shiftsHistory = [];
let currentProduct = null;
let firebaseApp = null;
let firestoreDb = null;
let firebaseAuth = null;
let currentUser = null;
let isOnline = navigator.onLine;
let isFirestoreReady = false;

const STORAGE_KEYS = {
  PRODUCTS: 'er_products',
  SALES: 'er_sales',
  SHIFTS: 'er_shifts',
  LOGO: 'er_logo',
  AUTH_USER: 'er_auth_user'
};

function formatCurrency(amount) {
  return '₦' + amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateShort(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

function getDateKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function saveToStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function loadFromStorage(key, defaultValue) {
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return defaultValue;
    }
  }
  return defaultValue;
}

function initFirebase() {
  if (typeof firebase === 'undefined' || !FIREBASE_CONFIG) return;
  try {
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      firebaseApp = firebase.app();
    }
    firestoreDb = firebase.firestore();
    firebaseAuth = firebase.auth();
    isFirestoreReady = true;
    setupOnlineListeners();
    return true;
  } catch (e) {
    console.warn('Firebase init failed, using offline mode:', e);
    isFirestoreReady = false;
    return false;
  }
}

function setupOnlineListeners() {
  window.addEventListener('online', () => {
    isOnline = true;
    updateSyncStatus();
    syncAllToFirestore();
  });
  window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncStatus();
  });
}

function updateSyncStatus() {
  const statusEl = document.getElementById('syncStatus');
  if (!statusEl) return;
  if (isOnline && isFirestoreReady && currentUser) {
    statusEl.className = 'sync-status';
    statusEl.innerHTML = '<span class="dot"></span> Synced';
  } else if (!isOnline) {
    statusEl.className = 'sync-status offline';
    statusEl.innerHTML = '<span class="dot"></span> Offline';
  } else {
    statusEl.style.display = 'none';
  }
}

async function syncProductsToFirestore() {
  if (!isFirestoreReady || !currentUser || !isOnline) return false;
  try {
    const batch = firestoreDb.batch();
    const productsRef = firestoreDb.collection('products');
    for (const p of products) {
      const ref = productsRef.doc(String(p.id));
      batch.set(ref, { ...p, updatedAt: new Date() }, { merge: true });
    }
    await batch.commit();
    return true;
  } catch (e) {
    console.warn('Products sync failed:', e);
    return false;
  }
}

async function syncSalesToFirestore() {
  if (!isFirestoreReady || !currentUser || !isOnline) return false;
  try {
    const salesRef = firestoreDb.collection('sales');
    for (const sale of salesHistory) {
      const exists = await salesRef.doc(sale.id).get();
      if (!exists.exists) {
        await salesRef.doc(sale.id).set({
          ...sale,
          createdAt: new Date(sale.date),
          syncedAt: new Date()
        });
      }
    }
    return true;
  } catch (e) {
    console.warn('Sales sync failed:', e);
    return false;
  }
}

async function syncShiftsToFirestore() {
  if (!isFirestoreReady || !currentUser || !isOnline) return false;
  try {
    const shiftsRef = firestoreDb.collection('shifts');
    for (const shift of shiftsHistory) {
      const exists = await shiftsRef.doc(shift.id).get();
      if (!exists.exists) {
        await shiftsRef.doc(shift.id).set({
          ...shift,
          syncedAt: new Date()
        });
      } else {
        await shiftsRef.doc(shift.id).set({
          ...shift,
          syncedAt: new Date()
        }, { merge: true });
      }
    }
    return true;
  } catch (e) {
    console.warn('Shifts sync failed:', e);
    return false;
  }
}

async function syncAllToFirestore() {
  if (!currentUser) return;
  await syncProductsToFirestore();
  await syncSalesToFirestore();
  await syncShiftsToFirestore();
}

async function loadProductsFromFirestore() {
  if (!isFirestoreReady || !currentUser || !isOnline) return null;
  try {
    const snapshot = await firestoreDb.collection('products').get();
    if (snapshot.empty) return null;
    const loaded = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      loaded.push({
        id: typeof data.id === 'number' ? data.id : parseInt(doc.id),
        name: data.name,
        category: data.category,
        price: Number(data.price),
        unit: data.unit,
        stock: Number(data.stock)
      });
    });
    return loaded.sort((a, b) => a.id - b.id);
  } catch (e) {
    console.warn('Load products from Firestore failed:', e);
    return null;
  }
}

async function loadShiftsFromFirestore() {
  if (!isFirestoreReady || !currentUser || !isOnline) return null;
  try {
    const snapshot = await firestoreDb.collection('shifts').orderBy('openedAt', 'desc').limit(100).get();
    if (snapshot.empty) return null;
    const loaded = [];
    snapshot.forEach(doc => {
      loaded.push(doc.data());
    });
    return loaded;
  } catch (e) {
    console.warn('Load shifts from Firestore failed:', e);
    return null;
  }
}

async function onAuthStateChange() {
  if (!firebaseAuth) return Promise.resolve(null);
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (firebaseAuth.currentUser) {
          resolve(firebaseAuth.currentUser);
        } else {
          const stored = loadFromStorage(STORAGE_KEYS.AUTH_USER, null);
          resolve(stored);
        }
      }
    }, 2500);

    firebaseAuth.onAuthStateChanged((user) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        currentUser = user;
        if (user) {
          saveToStorage(STORAGE_KEYS.AUTH_USER, { uid: user.uid, email: user.email });
        }
        resolve(user);
      }
    });
  });
}

async function checkAuth(required = false) {
  const storedUser = loadFromStorage(STORAGE_KEYS.AUTH_USER, null);
  currentUser = storedUser;

  if (!firebaseAuth) {
    return storedUser;
  }

  try {
    const user = await onAuthStateChange();
    if (user) {
      currentUser = user;
      saveToStorage(STORAGE_KEYS.AUTH_USER, { uid: user.uid, email: user.email });
      return user;
    }
    return storedUser;
  } catch (e) {
    console.warn('Auth check error:', e);
    return storedUser;
  }
}

async function requireAdminAuth() {
  const user = await checkAuth();
  if (!user) {
    const redirect = encodeURIComponent(window.location.pathname.split('/').pop() || 'admin.html');
    window.location.href = 'login.html?redirect=' + redirect;
    return false;
  }
  return true;
}

async function loginAdmin(email, password) {
  if (!firebaseAuth) {
    if (email === ADMIN_DEFAULTS.email && password === ADMIN_DEFAULTS.password) {
      currentUser = { email, uid: 'local-admin', displayName: 'Admin' };
      saveToStorage(STORAGE_KEYS.AUTH_USER, currentUser);
      return { user: currentUser };
    }
    throw new Error('Invalid email or password');
  }
  try {
    const result = await firebaseAuth.signInWithEmailAndPassword(email, password);
    currentUser = result.user;
    saveToStorage(STORAGE_KEYS.AUTH_USER, { uid: currentUser.uid, email: currentUser.email });
    return result;
  } catch (err) {
    if (email === ADMIN_DEFAULTS.email && password === ADMIN_DEFAULTS.password) {
      currentUser = { email, uid: 'local-admin', displayName: 'Admin', fallback: true };
      saveToStorage(STORAGE_KEYS.AUTH_USER, currentUser);
      return { user: currentUser };
    }
    throw err;
  }
}

async function logoutAdmin() {
  if (firebaseAuth && currentUser) {
    try { await firebaseAuth.signOut(); } catch (e) {}
  }
  currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
  window.location.href = 'index.html';
}

function initProducts() {
  products = loadFromStorage(STORAGE_KEYS.PRODUCTS, null);
  if (!products || products.length === 0) {
    products = JSON.parse(JSON.stringify(initialProducts));
    saveToStorage(STORAGE_KEYS.PRODUCTS, products);
  }
  if (isFirestoreReady && currentUser && isOnline) {
    loadProductsFromFirestore().then(fsProducts => {
      if (fsProducts && fsProducts.length > 0) {
        products = fsProducts;
        saveToStorage(STORAGE_KEYS.PRODUCTS, products);
        refreshProductUI();
      } else {
        syncProductsToFirestore();
      }
    });
  }
  return products;
}

function initSales() {
  salesHistory = loadFromStorage(STORAGE_KEYS.SALES, []);
  return salesHistory;
}

function initShifts() {
  shiftsHistory = loadFromStorage(STORAGE_KEYS.SHIFTS, []);
  if (isFirestoreReady && currentUser && isOnline) {
    loadShiftsFromFirestore().then(fsShifts => {
      if (fsShifts && fsShifts.length > 0) {
        shiftsHistory = fsShifts;
        saveToStorage(STORAGE_KEYS.SHIFTS, shiftsHistory);
        if (document.getElementById('shiftsHistoryBody') || document.getElementById('activeShiftSummary')) {
          renderAllAdminUI();
        }
      } else {
        syncShiftsToFirestore();
      }
    });
  }
  return shiftsHistory;
}

function saveProducts() {
  saveToStorage(STORAGE_KEYS.PRODUCTS, products);
  if (currentUser) syncProductsToFirestore();
}

function saveSales() {
  saveToStorage(STORAGE_KEYS.SALES, salesHistory);
  if (currentUser) syncSalesToFirestore();
}

function saveShifts() {
  saveToStorage(STORAGE_KEYS.SHIFTS, shiftsHistory);
  if (currentUser) syncShiftsToFirestore();
}

function getActiveShift() {
  return shiftsHistory.find(s => !s.closedAt) || null;
}

function openShift(openingCash = 0) {
  if (getActiveShift()) return null;
  const now = new Date();
  const shift = {
    id: 'SH-' + Date.now(),
    openedAt: now.toISOString(),
    closedAt: null,
    dateKey: getDateKey(now),
    openingCash: Number(openingCash) || 0,
    closingCash: 0,
    salesIds: [],
    productBreakdown: {},
    totals: {
      totalSales: 0,
      totalRevenue: 0,
      chickenRevenue: 0,
      fishRevenue: 0,
      itemsSold: 0,
      transactions: 0
    },
    openingStockSnapshot: {},
    closingStockSnapshot: {},
    openedBy: currentUser?.email || 'admin'
  };
  products.forEach(p => {
    shift.openingStockSnapshot[p.id] = { stock: p.stock, name: p.name };
  });
  shiftsHistory.unshift(shift);
  saveShifts();
  return shift;
}

function recordSaleInShift(sale) {
  const shift = getActiveShift();
  if (!shift) return;
  if (!shift.salesIds.includes(sale.id)) {
    shift.salesIds.push(sale.id);
  }
  shift.totals.totalSales += sale.total;
  shift.totals.totalRevenue += sale.total;
  shift.totals.transactions += 1;

  sale.items.forEach(item => {
    const revenue = item.price * item.quantity;
    shift.totals.itemsSold += item.quantity;
    const product = getProductById(item.productId);
    if (product?.category === 'Chicken') {
      shift.totals.chickenRevenue += revenue;
    } else if (product?.category === 'Fish') {
      shift.totals.fishRevenue += revenue;
    }
    if (!shift.productBreakdown[item.productId]) {
      shift.productBreakdown[item.productId] = {
        productId: item.productId,
        name: item.name,
        category: product?.category || 'Unknown',
        unit: item.unit,
        price: item.price,
        quantitySold: 0,
        totalRevenue: 0
      };
    }
    shift.productBreakdown[item.productId].quantitySold += item.quantity;
    shift.productBreakdown[item.productId].totalRevenue += revenue;
  });
  saveShifts();
}

function closeShift(closingCash = 0) {
  const shift = getActiveShift();
  if (!shift) return null;
  const now = new Date();
  shift.closedAt = now.toISOString();
  shift.closingCash = Number(closingCash) || 0;
  products.forEach(p => {
    shift.closingStockSnapshot[p.id] = { stock: p.stock, name: p.name };
  });
  shift.totals.expectedCash = shift.openingCash + shift.totals.totalRevenue;
  shift.totals.cashDifference = shift.closingCash - shift.totals.expectedCash;
  shift.closedBy = currentUser?.email || 'admin';
  saveShifts();
  return shift;
}

function addProduct(product) {
  const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  product.id = newId;
  products.push(product);
  saveProducts();
  return product;
}

function updateProduct(id, updatedData) {
  const index = products.findIndex(p => p.id === id);
  if (index !== -1) {
    products[index] = { ...products[index], ...updatedData };
    saveProducts();
    return products[index];
  }
  return null;
}

function deleteProduct(id) {
  const index = products.findIndex(p => p.id === id);
  if (index !== -1) {
    products.splice(index, 1);
    saveProducts();
    if (isFirestoreReady && currentUser && isOnline) {
      firestoreDb.collection('products').doc(String(id)).delete().catch(console.warn);
    }
    return true;
  }
  return false;
}

function getProductsByCategory(category) {
  return products.filter(p => p.category === category);
}

function getProductById(id) {
  return products.find(p => p.id === id);
}

function getStockStatus(stock) {
  if (stock < 5) return { class: 'stock-low', text: 'Low' };
  if (stock < 20) return { class: 'stock-medium', text: 'Medium' };
  return { class: 'stock-good', text: 'Good' };
}

function addToCart(product, quantity) {
  const existingItem = cart.find(item => item.productId === product.id);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      quantity: quantity
    });
  }
  saveCart();
}

function removeFromCart(productId) {
  const index = cart.findIndex(item => item.productId === productId);
  if (index !== -1) {
    cart.splice(index, 1);
    saveCart();
  }
}

function updateCartQuantity(productId, quantity) {
  const item = cart.find(i => i.productId === productId);
  if (item) {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      item.quantity = quantity;
      saveCart();
    }
  }
}

function clearCart() {
  cart = [];
  saveCart();
}

function saveCart() {
  sessionStorage.setItem('er_cart', JSON.stringify(cart));
}

function loadCart() {
  const stored = sessionStorage.getItem('er_cart');
  if (stored) {
    try {
      cart = JSON.parse(stored);
    } catch (e) {
      cart = [];
    }
  }
  return cart;
}

function calculateSubtotal(item) {
  return item.price * item.quantity;
}

function calculateTotal() {
  return cart.reduce((total, item) => total + calculateSubtotal(item), 0);
}

function isShiftOpenRequired() {
  const active = getActiveShift();
  if (!active) {
    return { open: false, message: '⚠️ No active shift! Please open a new shift in Admin page before making sales.' };
  }
  return { open: true };
}

function completeSale() {
  if (cart.length === 0) return null;

  const shiftCheck = isShiftOpenRequired();
  if (!shiftCheck.open) {
    alert(shiftCheck.message);
    return null;
  }

  for (const item of cart) {
    const product = getProductById(item.productId);
    if (!product) {
      alert(`Product ${item.name} not found!`);
      return null;
    }
    if (product.stock < item.quantity) {
      alert(`Insufficient stock for ${item.name}. Available: ${product.stock}`);
      return null;
    }
  }

  for (const item of cart) {
    const product = getProductById(item.productId);
    product.stock -= item.quantity;
  }
  saveProducts();

  const sale = {
    id: 'INV-' + Date.now(),
    date: new Date().toISOString(),
    shiftId: getActiveShift()?.id || null,
    items: JSON.parse(JSON.stringify(cart)),
    total: calculateTotal()
  };

  salesHistory.unshift(sale);
  saveSales();
  recordSaleInShift(sale);

  sessionStorage.setItem('er_last_sale', JSON.stringify(sale));

  return sale;
}

function getLastSale() {
  const stored = sessionStorage.getItem('er_last_sale');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function getTopSellingProducts(limit = 5, timeRange = 'all') {
  const breakdown = {};
  const now = new Date();
  const cutoff = timeRange === 'week' ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) :
                   timeRange === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : null;

  salesHistory.forEach(sale => {
    if (cutoff && new Date(sale.date) < cutoff) return;
    sale.items.forEach(item => {
      if (!breakdown[item.productId]) {
        breakdown[item.productId] = { ...item, quantitySold: 0, totalRevenue: 0 };
      }
      breakdown[item.productId].quantitySold += item.quantity;
      breakdown[item.productId].totalRevenue += item.quantity * item.price;
    });
  });
  return Object.values(breakdown).sort((a, b) => b.quantitySold - a.quantitySold).slice(0, limit);
}

function getStockDepletionRate(limit = 5) {
  const initialStock = {};
  initialProducts.forEach(p => { initialStock[p.id] = p.stock; });
  const depletion = [];
  products.forEach(p => {
    const initial = initialStock[p.id] || p.stock + 1;
    const sold = Math.max(0, initial - p.stock);
    const rate = initial > 0 ? (sold / initial) * 100 : 0;
    depletion.push({
      ...p,
      initialStock: initial,
      sold,
      depletionRate: rate
    });
  });
  return depletion.sort((a, b) => b.depletionRate - a.depletionRate).slice(0, limit);
}

function getDailyTotals(days = 7) {
  const totals = {};
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = getDateKey(d);
    totals[key] = { date: key, revenue: 0, transactions: 0, items: 0 };
  }
  salesHistory.forEach(sale => {
    const key = getDateKey(sale.date);
    if (totals[key]) {
      totals[key].revenue += sale.total;
      totals[key].transactions += 1;
      totals[key].items += sale.items.reduce((s, i) => s + i.quantity, 0);
    }
  });
  return Object.values(totals);
}

function renderProducts(category) {
  const container = document.getElementById('products-container');
  if (!container) return;

  const filteredProducts = category ? getProductsByCategory(category) : products;
  const icon = category === 'Chicken' ? '🐔' : category === 'Fish' ? '🐟' : '📦';
  const cardClass = category === 'Chicken' ? 'chicken-card' : category === 'Fish' ? 'fish-card' : '';

  if (filteredProducts.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <div class="display-1 text-muted fade-in">${icon}</div>
        <p class="mt-3 text-muted">No products in this category yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredProducts.map((product, idx) => {
    const stockStatus = getStockStatus(product.stock);
    const isDisabled = product.stock === 0;
    const delay = (idx % 12) * 0.05;
    return `
      <div class="col-6 col-sm-4 col-md-3 mb-3" style="animation-delay:${delay}s">
        <div class="card product-card ${cardClass} ${isDisabled ? 'out-of-stock' : ''} position-relative ${isDisabled ? 'opacity-50' : ''}" 
             ${isDisabled ? '' : `onclick="openProductModal(${product.id})"`}
             ${isDisabled ? 'style="cursor:not-allowed"' : ''}>
          <span class="badge stock-badge ${stockStatus.class}">
            ${product.stock} ${product.unit}
          </span>
          <div class="card-body text-center">
            <span class="product-icon">${icon}</span>
            <h5 class="product-name">${product.name}</h5>
            <div class="product-price">${formatCurrency(product.price)}</div>
            <small class="text-muted">/ ${product.unit}</small>
            ${isDisabled ? '<div class="mt-2 text-danger fw-bold bounce-in">OUT OF STOCK</div>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderCart() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalContainer = document.getElementById('cart-total');

  if (!cartItemsContainer) return;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        <div class="display-4 mb-3">🛒</div>
        <p class="mb-0">Your cart is empty</p>
        <small>Click on products to add them</small>
      </div>
    `;
    if (cartTotalContainer) {
      cartTotalContainer.textContent = formatCurrency(0);
    }
    return;
  }

  cartItemsContainer.innerHTML = cart.map((item, idx) => `
    <div class="cart-item-row d-flex align-items-center justify-content-between" style="animation-delay:${idx * 0.05}s">
      <div class="flex-grow-1 me-2" style="min-width:0">
        <div class="fw-semibold small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
        <div class="text-muted small">
          ${formatCurrency(item.price)} × ${item.quantity} ${item.unit}
        </div>
        <div class="input-group mt-1" style="width:130px">
          <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="changeCartQty(${item.productId}, -1)">−</button>
          <input type="number" class="form-control form-control-sm text-center py-0" value="${item.quantity}" min="1" max="${getProductById(item.productId)?.stock || 999}" onchange="setCartQty(${item.productId}, this.value)">
          <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="changeCartQty(${item.productId}, 1)">+</button>
        </div>
      </div>
      <div class="text-end ms-2">
        <div class="fw-bold">${formatCurrency(calculateSubtotal(item))}</div>
        <button class="btn btn-sm btn-outline-danger mt-1 px-2 py-0" onclick="removeCartItem(${item.productId})">
          <small>✕ Remove</small>
        </button>
      </div>
    </div>
  `).join('');

  if (cartTotalContainer) {
    cartTotalContainer.textContent = formatCurrency(calculateTotal());
  }
}

function changeCartQty(productId, delta) {
  const item = cart.find(i => i.productId === productId);
  if (item) {
    const newQty = item.quantity + delta;
    updateCartQuantity(productId, newQty);
    renderCart();
  }
}

function setCartQty(productId, value) {
  const qty = parseInt(value);
  if (!isNaN(qty) && qty > 0) {
    const product = getProductById(productId);
    if (product && qty > product.stock) {
      alert(`Only ${product.stock} ${product.unit} available in stock.`);
      return;
    }
    updateCartQuantity(productId, qty);
  }
  renderCart();
}

function removeCartItem(productId) {
  removeFromCart(productId);
  renderCart();
}

function openProductModal(productId) {
  const shiftCheck = isShiftOpenRequired();
  if (!shiftCheck.open) {
    alert(shiftCheck.message);
    showShiftClosedModal();
    return;
  }

  const product = getProductById(productId);
  if (!product) return;
  if (product.stock === 0) {
    alert('This product is out of stock!');
    return;
  }

  currentProduct = product;
  document.getElementById('modalProductName').textContent = product.name;
  document.getElementById('modalProductPrice').textContent = formatCurrency(product.price) + ' / ' + product.unit;
  document.getElementById('modalProductStock').textContent = product.stock + ' ' + product.unit + ' available';
  document.getElementById('modalProductIcon').textContent = product.category === 'Chicken' ? '🐔' : '🐟';
  document.getElementById('modalQuantity').value = 1;
  document.getElementById('modalQuantity').max = product.stock;
  updateModalSubtotal();

  const modal = new bootstrap.Modal(document.getElementById('productModal'));
  modal.show();
}

function showShiftClosedModal() {
  const html = `
    <div class="modal fade" id="shiftClosedModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title">🔒 Shift Closed</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body text-center p-5">
            <div class="display-1 mb-3">⛔</div>
            <h4 class="mb-3">No Active Shift!</h4>
            <p class="text-muted mb-0">Please ask the admin to open a new shift in the Admin page before making any sales.</p>
          </div>
          <div class="modal-footer justify-content-center">
            <button class="btn btn-danger big-btn" data-bs-dismiss="modal">Got it</button>
          </div>
        </div>
      </div>
    </div>`;
  let el = document.getElementById('shiftClosedModalWrapper');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shiftClosedModalWrapper';
    el.innerHTML = html;
    document.body.appendChild(el);
  }
  const m = new bootstrap.Modal(document.getElementById('shiftClosedModal'));
  m.show();
}

function updateModalSubtotal() {
  if (!currentProduct) return;
  const qty = parseInt(document.getElementById('modalQuantity').value) || 0;
  const subtotal = currentProduct.price * qty;
  document.getElementById('modalSubtotal').textContent = formatCurrency(subtotal);
}

function changeModalQty(delta) {
  const input = document.getElementById('modalQuantity');
  const max = parseInt(input.max) || 999;
  let qty = parseInt(input.value) || 0;
  qty = Math.max(1, Math.min(max, qty + delta));
  input.value = qty;
  updateModalSubtotal();
}

function addFromModalToCart() {
  if (!currentProduct) return;
  const qty = parseInt(document.getElementById('modalQuantity').value) || 0;
  if (qty <= 0) {
    alert('Please enter a valid quantity');
    return;
  }
  if (qty > currentProduct.stock) {
    alert(`Only ${currentProduct.stock} available`);
    return;
  }

  addToCart(currentProduct, qty);
  renderCart();
  updateCartCount();

  const modal = bootstrap.Modal.getInstance(document.getElementById('productModal'));
  modal.hide();
  currentProduct = null;
}

function handleCompleteSale() {
  if (cart.length === 0) {
    alert('Your cart is empty!');
    return;
  }
  const shiftCheck = isShiftOpenRequired();
  if (!shiftCheck.open) {
    alert(shiftCheck.message);
    return;
  }

  const sale = completeSale();
  if (sale) {
    clearCart();
    renderCart();
    updateCartCount();
    window.location.href = 'receipt.html';
  }
}

function handlePrintReceipt() {
  if (cart.length === 0) {
    alert('Your cart is empty!');
    return;
  }
  const shiftCheck = isShiftOpenRequired();
  if (!shiftCheck.open) {
    alert(shiftCheck.message);
    return;
  }
  const sale = completeSale();
  if (sale) {
    clearCart();
    window.location.href = 'receipt.html?autoPrint=1';
  }
}

function updateCartCount() {
  const cartCount = document.getElementById('cart-count');
  if (cartCount) {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems + ' item' + (totalItems !== 1 ? 's' : '');
  }
}

function renderAdminTable() {
  const tbody = document.getElementById('adminTableBody');
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          No products yet. Click "Add Product" to start.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = products.map((product, idx) => {
    const stockStatus = getStockStatus(product.stock);
    const isLowStock = product.stock < 5;
    return `
      <tr class="${isLowStock ? 'low-stock-alert' : ''}" style="animation:fadeInUp 0.4s ease-out both;animation-delay:${idx * 0.02}s">
        <td class="fw-bold">${product.id}</td>
        <td>
          ${product.category === 'Chicken' ? '🐔' : '🐟'}
          <span class="fw-semibold">${product.name}</span>
        </td>
        <td>
          <span class="badge ${product.category === 'Chicken' ? 'bg-danger' : 'bg-primary'}">
            ${product.category}
          </span>
        </td>
        <td class="fw-bold text-success">${formatCurrency(product.price)}</td>
        <td>${product.unit}</td>
        <td>
          <span class="badge ${stockStatus.class}">${product.stock} ${product.unit}</span>
          ${isLowStock ? ' <span class="badge bg-danger ms-1 bounce-in">⚠ LOW</span>' : ''}
        </td>
        <td>
          <button class="btn btn-sm btn-primary me-1" onclick="editProduct(${product.id})">
            ✏️ Edit
          </button>
          <button class="btn btn-sm btn-danger" onclick="confirmDelete(${product.id})">
            🗑️ Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderActiveShiftCard() {
  const container = document.getElementById('activeShiftSummary');
  if (!container) return;

  const active = getActiveShift();
  if (!active) {
    container.innerHTML = `
      <div class="card border-0 shadow-sm border-start border-secondary border-5 stat-card">
        <div class="card-body text-center py-4">
          <div class="display-4 mb-2 text-secondary">🌙</div>
          <h4 class="mb-2 text-secondary">No Active Shift</h4>
          <p class="text-muted mb-3 small">Open a new shift to start tracking today's sales</p>
          <button class="btn btn-success big-btn w-100" onclick="openShiftFromAdmin()">
            🚪 Open New Shift
          </button>
        </div>
      </div>
    `;
    return;
  }

  const breakdown = Object.values(active.productBreakdown);
  const itemsSold = breakdown.reduce((s, p) => s + p.quantitySold, 0);
  const topProduct = breakdown.sort((a, b) => b.quantitySold - a.quantitySold)[0];

  container.innerHTML = `
    <div class="card border-0 shadow-sm border-start border-success border-5 stat-card shift-active pulse-glow-success">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <span class="badge bg-success mb-2 pulse-glow-success">● SHIFT ACTIVE</span>
            <h4 class="mb-0 text-success">Today's Shift</h4>
            <small class="text-muted">Started: ${formatDate(active.openedAt)}</small>
          </div>
          <button class="btn btn-danger" onclick="closeShiftFromAdmin()">
            🔒 Close Shift
          </button>
        </div>
        <div class="row g-3 text-center">
          <div class="col-3">
            <div class="p-2 rounded-3 bg-light">
              <div class="fw-bold text-primary fs-5">${active.totals.transactions}</div>
              <small class="text-muted">Sales</small>
            </div>
          </div>
          <div class="col-3">
            <div class="p-2 rounded-3 bg-light">
              <div class="fw-bold text-success fs-5">${itemsSold}</div>
              <small class="text-muted">Items</small>
            </div>
          </div>
          <div class="col-3">
            <div class="p-2 rounded-3 bg-light">
              <div class="fw-bold text-danger fs-5">${breakdown.length}</div>
              <small class="text-muted">Products</small>
            </div>
          </div>
          <div class="col-3">
            <div class="p-2 rounded-3 bg-light">
              <div class="fw-bold fs-5" style="color:var(--brand-green)">${formatCurrency(active.totals.totalRevenue).replace('₦','₦')}</div>
              <small class="text-muted">Revenue</small>
            </div>
          </div>
        </div>
        ${topProduct ? `
        <div class="mt-3 p-2 rounded-3" style="background:linear-gradient(135deg, rgba(25,118,210,0.05), transparent);">
          <small class="text-muted">🏆 Top Selling: <strong>${topProduct.name}</strong> (${topProduct.quantitySold} ${topProduct.unit})</small>
        </div>` : ''}
      </div>
    </div>
  `;
}

function renderAnalytics() {
  const topProducts = document.getElementById('topProductsBody');
  const depletionBody = document.getElementById('depletionBody');
  const dailyStats = document.getElementById('dailyStatsCards');
  const summaryStats = document.getElementById('summaryStatsCards');

  if (summaryStats) {
    const allTimeRevenue = salesHistory.reduce((s, x) => s + x.total, 0);
    const allTimeItems = salesHistory.reduce((s, x) => s + x.items.reduce((a, i) => a + i.quantity, 0), 0);
    const allTimeTransactions = salesHistory.length;
    const chickenCount = products.filter(p => p.category === 'Chicken').reduce((s, p) => s + p.stock, 0);
    const fishCount = products.filter(p => p.category === 'Fish').reduce((s, p) => s + p.stock, 0);

    summaryStats.innerHTML = `
      <div class="col-md-3">
        <div class="card border-0 shadow-sm border-start border-success border-5 stat-card">
          <div class="card-body text-center">
            <div class="display-4 mb-2 text-success">💰</div>
            <h3 class="mb-0 text-success" style="font-size:1.3rem">${formatCurrency(allTimeRevenue)}</h3>
            <small class="text-muted">All-Time Revenue</small>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 shadow-sm border-start border-primary border-5 stat-card">
          <div class="card-body text-center">
            <div class="display-4 mb-2 text-primary">🧾</div>
            <h3 class="mb-0 text-primary">${allTimeTransactions}</h3>
            <small class="text-muted">Total Transactions</small>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 shadow-sm border-start border-danger border-5 stat-card">
          <div class="card-body text-center">
            <div class="display-4 mb-2" style="color:#D32F2F">🐔</div>
            <h3 class="mb-0" style="color:#D32F2F">${chickenCount}</h3>
            <small class="text-muted">Chicken Stock (total units)</small>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 shadow-sm border-start border-info border-5 stat-card">
          <div class="card-body text-center">
            <div class="display-4 mb-2 text-info">🐟</div>
            <h3 class="mb-0 text-info">${fishCount}</h3>
            <small class="text-muted">Fish Stock (total units)</small>
          </div>
        </div>
      </div>
    `;
  }

  if (topProducts) {
    const top = getTopSellingProducts(8);
    if (top.length === 0) {
      topProducts.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No sales data yet.</td></tr>';
    } else {
      topProducts.innerHTML = top.map((p, idx) => {
        const medals = ['🥇', '🥈', '🥉'];
        const medal = medals[idx] || `#${idx + 1}`;
        const product = getProductById(p.productId);
        const pct = p.quantitySold / Math.max(1, top[0].quantitySold) * 100;
        return `
          <tr style="animation:fadeInUp 0.4s ease-out both;animation-delay:${idx * 0.05}s">
            <td class="fw-bold" style="font-size:1.2rem">${medal}</td>
            <td>
              ${product?.category === 'Chicken' ? '🐔' : product?.category === 'Fish' ? '🐟' : '📦'}
              <span class="fw-semibold">${p.name}</span>
            </td>
            <td>
              <span class="badge bg-primary">${p.quantitySold} ${p.unit}</span>
            </td>
            <td class="fw-bold text-success">${formatCurrency(p.totalRevenue)}</td>
            <td>
              <div class="progress" style="height:8px;border-radius:10px">
                <div class="progress-bar bg-success" style="width:${pct}%;background:linear-gradient(90deg,var(--brand-green-light),var(--brand-green))"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  if (depletionBody) {
    const rates = getStockDepletionRate(8);
    if (rates.length === 0) {
      depletionBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No data.</td></tr>';
    } else {
      depletionBody.innerHTML = rates.map((p, idx) => {
        const rate = p.depletionRate.toFixed(1);
        const barClass = p.depletionRate > 70 ? 'bg-danger' : p.depletionRate > 40 ? 'bg-warning' : 'bg-info';
        return `
          <tr style="animation:fadeInUp 0.4s ease-out both;animation-delay:${idx * 0.05}s">
            <td class="fw-bold">#${idx + 1}</td>
            <td>
              ${p.category === 'Chicken' ? '🐔' : '🐟'}
              <span class="fw-semibold">${p.name}</span>
            </td>
            <td>${p.sold} / ${p.initialStock} ${p.unit}</td>
            <td>
              <span class="badge ${p.depletionRate > 70 ? 'bg-danger' : p.depletionRate > 40 ? 'bg-warning' : 'bg-info'}">${rate}%</span>
            </td>
            <td>
              <div class="progress" style="height:8px;border-radius:10px">
                <div class="progress-bar ${barClass}" style="width:${Math.min(100, p.depletionRate)}%"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  if (dailyStats) {
    const daily = getDailyTotals(7);
    const maxRev = Math.max(1, ...daily.map(d => d.revenue));
    dailyStats.innerHTML = daily.map((d, idx) => {
      const h = (d.revenue / maxRev) * 100;
      return `
        <div class="col text-center" style="animation:fadeInUp 0.4s ease-out both;animation-delay:${idx * 0.05}s">
          <small class="text-muted mb-1 d-block" style="font-size:0.7rem">${formatDateShort(d.date).slice(0,6)}</small>
          <div class="d-flex justify-content-center align-items-end mb-1" style="height:90px">
            <div class="w-100 rounded-top" style="
              height:${Math.max(4, h)}%;
              min-height:${d.revenue > 0 ? '6px' : '2px'};
              background:${d.revenue > 0 ? 'linear-gradient(180deg,var(--brand-green-light),var(--brand-green))' : '#e0e0e0'};
              transition:height 0.5s cubic-bezier(0.68,-0.55,0.265,1.55);
              box-shadow:${d.revenue > 0 ? '0 -2px 8px rgba(56,142,60,0.2)' : 'none'};
            " title="${formatCurrency(d.revenue)}"></div>
          </div>
          <small class="fw-semibold d-block" style="font-size:0.65rem;color:var(--brand-green)">${d.transactions}🛒</small>
          <small class="text-muted d-block" style="font-size:0.6rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.revenue > 0 ? formatCurrency(d.revenue).replace('.00','') : '-'}</small>
        </div>
      `;
    }).join('');
  }
}

function renderShiftsHistory() {
  const tbody = document.getElementById('shiftsHistoryBody');
  if (!tbody) return;
  const closed = shiftsHistory.filter(s => s.closedAt).slice(0, 20);
  if (closed.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No closed shifts yet.</td></tr>';
    return;
  }
  tbody.innerHTML = closed.map((shift, idx) => {
    const productCount = Object.values(shift.productBreakdown).length;
    const itemsSold = Object.values(shift.productBreakdown).reduce((s,p) => s + p.quantitySold, 0);
    const diffClass = shift.totals.cashDifference > 0 ? 'text-success' : shift.totals.cashDifference < 0 ? 'text-danger' : 'text-muted';
    return `
      <tr style="cursor:pointer;animation:fadeInUp 0.4s ease-out both;animation-delay:${idx * 0.03}s" onclick="showShiftSummary('${shift.id}')">
        <td class="fw-bold">${formatDateShort(shift.openedAt)}</td>
        <td><small>${formatTime(shift.openedAt)} → ${formatTime(shift.closedAt)}</small></td>
        <td><span class="badge bg-primary">${shift.totals.transactions}</span></td>
        <td><span class="badge bg-info">${itemsSold} units</span></td>
        <td class="fw-bold text-success">${formatCurrency(shift.totals.totalRevenue)}</td>
        <td>
          ${shift.totals.cashDifference != null ? `<span class="${diffClass} small fw-semibold">Δ ${formatCurrency(shift.totals.cashDifference)}</span>` : '-'}
        </td>
      </tr>
    `;
  }).join('');
}

function showShiftSummary(shiftId) {
  const shift = shiftsHistory.find(s => s.id === shiftId);
  if (!shift) return;
  const breakdown = Object.values(shift.productBreakdown).sort((a,b) => b.quantitySold - a.quantitySold);
  const html = `
    <div class="modal fade" id="shiftSummaryModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-gradient-blue text-white">
            <h5 class="modal-title">📊 Shift Summary · ${formatDateShort(shift.openedAt)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-4">
            <div class="row g-3 mb-4">
              <div class="col-4"><div class="p-3 bg-light rounded text-center"><small class="text-muted">Opened</small><div class="fw-bold">${formatTime(shift.openedAt)}</div></div></div>
              <div class="col-4"><div class="p-3 bg-light rounded text-center"><small class="text-muted">Closed</small><div class="fw-bold">${formatTime(shift.closedAt)}</div></div></div>
              <div class="col-4"><div class="p-3 bg-light rounded text-center"><small class="text-muted">Transactions</small><div class="fw-bold text-primary">${shift.totals.transactions}</div></div></div>
              <div class="col-6"><div class="p-3 rounded text-center" style="background:linear-gradient(135deg,rgba(25,118,210,0.08),transparent)"><small class="text-muted">Chicken Revenue</small><div class="fw-bold" style="color:#D32F2F">${formatCurrency(shift.totals.chickenRevenue)}</div></div></div>
              <div class="col-6"><div class="p-3 rounded text-center" style="background:linear-gradient(135deg,rgba(56,142,60,0.08),transparent)"><small class="text-muted">Fish Revenue</small><div class="fw-bold" style="color:#1976D2">${formatCurrency(shift.totals.fishRevenue)}</div></div></div>
            </div>
            <div class="p-3 mb-3 rounded-3 gradient-bg text-center text-white">
              <h4 class="mb-0">TOTAL REVENUE: ${formatCurrency(shift.totals.totalRevenue)}</h4>
              <small>Opening: ${formatCurrency(shift.openingCash)} · Expected Cash: ${formatCurrency(shift.totals.expectedCash || 0)} · Actual: ${formatCurrency(shift.closingCash)}${shift.totals.cashDifference != null ? ` · <strong>Δ ${formatCurrency(shift.totals.cashDifference)}</strong>` : ''}</small>
            </div>
            <h6 class="mb-2 fw-semibold">🛒 Itemized Sales (${breakdown.length} products):</h6>
            <div class="table-responsive" style="max-height:300px;overflow-y:auto">
              <table class="table table-sm align-middle mb-0">
                <thead class="table-dark sticky-top"><tr><th>Product</th><th>Qty</th><th class="text-end">Unit Price</th><th class="text-end">Total</th></tr></thead>
                <tbody>
                  ${breakdown.length === 0 ? '<tr><td colspan="4" class="text-center py-3 text-muted">No sales recorded this shift</td></tr>' :
                    breakdown.map(p => `
                    <tr>
                      <td>${p.category === 'Chicken' ? '🐔' : '🐟'} <span class="fw-semibold">${p.name}</span></td>
                      <td><span class="badge bg-primary">${p.quantitySold} ${p.unit}</span></td>
                      <td class="text-end">${formatCurrency(p.price)}</td>
                      <td class="text-end fw-bold text-success">${formatCurrency(p.totalRevenue)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button class="btn btn-primary" onclick="printShiftSummary('${shift.id}')">🖨️ Print Report</button>
          </div>
        </div>
      </div>
    </div>`;
  let wrap = document.getElementById('shiftSummaryWrapper');
  if (wrap) wrap.remove();
  wrap = document.createElement('div');
  wrap.id = 'shiftSummaryWrapper';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  new bootstrap.Modal(document.getElementById('shiftSummaryModal')).show();
}

function printShiftSummary(shiftId) {
  const shift = shiftsHistory.find(s => s.id === shiftId);
  if (!shift) return;
  const breakdown = Object.values(shift.productBreakdown).sort((a,b) => b.quantitySold - a.quantitySold);
  const w = window.open('', '', 'width=480,height=700');
  w.document.write(`<!DOCTYPE html><html><head><title>Shift Report ${formatDateShort(shift.openedAt)}</title>
  <style>body{font-family:Courier New,monospace;padding:20px;font-size:12px}h1{font-size:18px;text-align:center;margin:0}h2{font-size:14px;text-align:center;margin:4px 0 16px;border-bottom:2px dashed #333;padding-bottom:8px}table{width:100%;border-collapse:collapse}th,td{padding:4px 2px;border-bottom:1px dotted #ccc;text-align:left}th{border-bottom:2px solid #333}.total{border-top:2px dashed #333;padding-top:10px;margin-top:10px;font-weight:bold;font-size:14px}.right{text-align:right}</style></head><body>
  <h1>${BUSINESS_INFO.name}</h1><h2>${BUSINESS_INFO.parent}</h2>
  <h3 style="text-align:center;font-size:15px;margin:16px 0 8px">📊 SHIFT CLOSING REPORT</h3>
  <div style="border-top:1px dashed #333;border-bottom:1px dashed #333;padding:8px 0;margin-bottom:12px">
    <div><strong>Date:</strong> ${formatDateShort(shift.openedAt)}</div>
    <div><strong>Opened:</strong> ${formatTime(shift.openedAt)}</div>
    <div><strong>Closed:</strong> ${formatTime(shift.closedAt)}</div>
    <div><strong>Opened by:</strong> ${shift.openedBy || 'Admin'}</div>
  </div>
  <table><thead><tr><th>ITEM</th><th>QTY</th><th class="right">PRICE</th><th class="right">TOTAL</th></tr></thead><tbody>
  ${breakdown.map(p => `<tr><td>${p.name}</td><td>${p.quantitySold} ${p.unit}</td><td class="right">${formatCurrency(p.price)}</td><td class="right">${formatCurrency(p.totalRevenue)}</td></tr>`).join('')}
  </tbody></table>
  <div class="total">
    <div class="right">TRANSACTIONS: ${shift.totals.transactions}</div>
    <div class="right">CHICKEN: ${formatCurrency(shift.totals.chickenRevenue)}</div>
    <div class="right">FISH: ${formatCurrency(shift.totals.fishRevenue)}</div>
    <div class="right" style="font-size:16px;border-top:1px dashed #333;margin-top:6px;padding-top:6px">TOTAL: ${formatCurrency(shift.totals.totalRevenue)}</div>
    <div class="right" style="margin-top:10px">OPENING CASH: ${formatCurrency(shift.openingCash)}</div>
    <div class="right">EXPECTED CASH: ${formatCurrency(shift.totals.expectedCash || 0)}</div>
    <div class="right">ACTUAL CASH: ${formatCurrency(shift.closingCash)}</div>
    <div class="right" style="color:${(shift.totals.cashDifference || 0) < 0 ? 'red' : 'green'}">DIFFERENCE: ${formatCurrency(shift.totals.cashDifference || 0)}</div>
  </div>
  <div style="text-align:center;margin-top:20px;border-top:1px dashed #333;padding-top:12px;font-size:11px">
    <p>Thank you - ${BUSINESS_INFO.tagline}</p>
    <p style="font-style:italic">Powered by Eghale Cold Room POS</p>
  </div>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

function openShiftFromAdmin() {
  const cash = prompt('Enter Opening Cash (₦):', '0');
  if (cash === null) return;
  const amt = parseFloat(cash);
  if (isNaN(amt) || amt < 0) { alert('Invalid amount'); return; }
  openShift(amt);
  renderAllAdminUI();
}

function closeShiftFromAdmin() {
  const active = getActiveShift();
  if (!active) return;
  const expected = active.openingCash + active.totals.totalRevenue;
  const cash = prompt(`Enter Closing Cash (₦):\n\nOpening: ${formatCurrency(active.openingCash)}\nSales: ${formatCurrency(active.totals.totalRevenue)}\nExpected: ${formatCurrency(expected)}`, String(expected));
  if (cash === null) return;
  const amt = parseFloat(cash);
  if (isNaN(amt) || amt < 0) { alert('Invalid amount'); return; }
  const closed = closeShift(amt);
  if (closed) {
    renderAllAdminUI();
    showShiftSummary(closed.id);
  }
}

function updateSalesPageShiftStatus() {
  const el = document.getElementById('shiftStatusBar');
  if (!el) return;
  const active = getActiveShift();
  if (!active) {
    el.className = 'shift-status-bar shift-closed';
    el.innerHTML = '<span class="fw-bold">⛔ SHIFT CLOSED</span> · Cannot make sales. Ask admin to open a new shift.';
  } else {
    el.className = 'shift-status-bar shift-open';
    el.innerHTML = `<span class="fw-bold">● SHIFT OPEN</span> · Started ${formatDate(active.openedAt)} · ${active.totals.transactions} sales · ${formatCurrency(active.totals.totalRevenue)} revenue today`;
  }
}

function renderSalesHistoryTable() {
  const tbody = document.getElementById('salesHistoryBody');
  if (!tbody) return;
  if (salesHistory.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No sales recorded yet.</td></tr>';
  } else {
    tbody.innerHTML = salesHistory.slice(0, 15).map((sale, idx) => `
      <tr style="animation:fadeInUp 0.4s ease-out both;animation-delay:${idx * 0.04}s">
        <td class="fw-bold">${sale.id}</td>
        <td>${formatDate(sale.date)}</td>
        <td><small>${sale.shiftId ? sale.shiftId : '<span class="text-muted">N/A</span>'}</small></td>
        <td><span class="badge bg-primary">${sale.items.length} item${sale.items.length !== 1 ? 's' : ''}</span></td>
        <td class="fw-bold text-success">${formatCurrency(sale.total)}</td>
      </tr>
    `).join('');
  }
}

function renderAllAdminUI() {
  renderAdminTable();
  document.getElementById('statTotalProducts').textContent = products.length;
  document.getElementById('statLowStock').textContent = products.filter(p => p.stock < 5).length;
  document.getElementById('statFish').textContent = products.filter(p => p.category === 'Fish').length;
  document.getElementById('statChicken').textContent = products.filter(p => p.category === 'Chicken').length;
  renderActiveShiftCard();
  renderAnalytics();
  renderShiftsHistory();
  renderSalesHistoryTable();
}

function refreshProductUI() {
  if (document.getElementById('products-container')) {
    const activeTab = document.querySelector('.nav-tabs .nav-link.active');
    const category = activeTab?.id === 'tab-fish' ? 'Fish' : 'Chicken';
    renderProducts(category);
  }
  if (document.getElementById('adminTableBody')) {
    renderAllAdminUI();
  }
}

function openAddProductModal() {
  document.getElementById('productFormTitle').textContent = '➕ Add New Product';
  document.getElementById('productForm').reset();
  document.getElementById('editProductId').value = '';
  const modal = new bootstrap.Modal(document.getElementById('productFormModal'));
  modal.show();
}

function editProduct(id) {
  const product = getProductById(id);
  if (!product) return;

  document.getElementById('productFormTitle').textContent = '✏️ Edit Product';
  document.getElementById('editProductId').value = product.id;
  document.getElementById('productName').value = product.name;
  document.getElementById('productCategory').value = product.category;
  document.getElementById('productPrice').value = product.price;
  document.getElementById('productUnit').value = product.unit;
  document.getElementById('productStock').value = product.stock;

  const modal = new bootstrap.Modal(document.getElementById('productFormModal'));
  modal.show();
}

function saveProductForm() {
  const id = document.getElementById('editProductId').value;
  const name = document.getElementById('productName').value.trim();
  const category = document.getElementById('productCategory').value;
  const price = parseFloat(document.getElementById('productPrice').value);
  const unit = document.getElementById('productUnit').value.trim();
  const stock = parseInt(document.getElementById('productStock').value);

  if (!name || !category || isNaN(price) || price < 0 || !unit || isNaN(stock) || stock < 0) {
    alert('Please fill in all fields correctly!');
    return false;
  }

  const productData = { name, category, price, unit, stock };

  if (id) {
    updateProduct(parseInt(id), productData);
  } else {
    addProduct(productData);
  }

  renderAllAdminUI();
  const modal = bootstrap.Modal.getInstance(document.getElementById('productFormModal'));
  modal.hide();
  return false;
}

function confirmDelete(id) {
  const product = getProductById(id);
  if (!product) return;
  if (confirm(`Are you sure you want to delete "${product.name}"? This cannot be undone.`)) {
    deleteProduct(id);
    renderAllAdminUI();
  }
}

function saveLogo(dataUrl) {
  saveToStorage(STORAGE_KEYS.LOGO, dataUrl);
  if (isFirestoreReady && currentUser && isOnline) {
    firestoreDb.collection('settings').doc('logo').set({
      dataUrl,
      updatedAt: new Date()
    }).catch(console.warn);
  }
}

function loadLogo() {
  let logo = loadFromStorage(STORAGE_KEYS.LOGO, null);
  if (!logo && isFirestoreReady && currentUser && isOnline) {
    firestoreDb.collection('settings').doc('logo').get().then(doc => {
      if (doc.exists && doc.data().dataUrl) {
        saveLogo(doc.data().dataUrl);
        const el = document.getElementById('logoUpload');
        if (el) el.innerHTML = `<img src="${doc.data().dataUrl}" alt="Logo">`;
      }
    }).catch(console.warn);
  }
  return logo;
}

function setupLogoUpload() {
  const logoUpload = document.getElementById('logoUpload');
  const logoInput = document.getElementById('logoInput');
  if (!logoUpload || !logoInput) return;

  const savedLogo = loadLogo();
  if (savedLogo) {
    logoUpload.innerHTML = `<img src="${savedLogo}" alt="Logo">`;
  }

  logoUpload.addEventListener('click', () => logoInput.click());
  logoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        saveLogo(dataUrl);
        logoUpload.innerHTML = `<img src="${dataUrl}" alt="Logo">`;
      };
      reader.readAsDataURL(file);
    }
  });
}

function renderReceipt() {
  const sale = getLastSale();
  const container = document.getElementById('receiptContent');
  if (!container) return;

  if (!sale) {
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="display-1 mb-3 fade-in">📋</div>
        <p>No receipt found.</p>
        <a href="index.html" class="btn btn-primary">Back to Sales</a>
      </div>
    `;
    return;
  }

  const logo = loadLogo();
  const logoHtml = logo ? `<img src="${logo}" alt="Logo" style="max-width:80px;max-height:80px;margin-bottom:10px;border-radius:8px;">` : '<div style="font-size:40px;">🏪</div>';

  container.innerHTML = `
    <div class="receipt-container" id="receiptPrint">
      <div class="receipt-header">
        ${logoHtml}
        <h2>${BUSINESS_INFO.name}</h2>
        <div class="parent-name">${BUSINESS_INFO.parent}</div>
        <p style="margin:5px 0;font-size:0.85rem;">${BUSINESS_INFO.tagline}</p>
        <p style="margin:5px 0;font-size:0.85rem;">${BUSINESS_INFO.address}</p>
        <p style="margin:5px 0;font-size:0.85rem;">${BUSINESS_INFO.phone}</p>
        <div style="border-top:1px dashed #333;margin-top:10px;padding-top:10px;">
          <div style="font-size:0.85rem;"><strong>Invoice #:</strong> ${sale.id}</div>
          <div style="font-size:0.85rem;"><strong>Date:</strong> ${formatDate(sale.date)}</div>
          ${sale.shiftId ? `<div style="font-size:0.85rem;"><strong>Shift:</strong> ${sale.shiftId}</div>` : ''}
        </div>
      </div>

      <table class="receipt-table">
        <thead>
          <tr>
            <th style="width:45%">Item</th>
            <th style="width:15%;text-align:center">Qty</th>
            <th style="width:20%;text-align:right">Price</th>
            <th style="width:20%;text-align:right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${sale.items.map(item => `
            <tr>
              <td>${item.name}</td>
              <td style="text-align:center">${item.quantity} ${item.unit}</td>
              <td style="text-align:right">${formatCurrency(item.price)}</td>
              <td style="text-align:right">${formatCurrency(calculateSubtotal(item))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="receipt-total" style="text-align:right">
        <div>TOTAL: ${formatCurrency(sale.total)}</div>
      </div>

      <div class="receipt-footer">
        <p style="margin:5px 0;">Thank you for your patronage!</p>
        <p style="margin:5px 0;">Please come again 🙏</p>
        <p style="margin:10px 0 0 0;font-style:italic;">Powered by Eghale Cold Room POS</p>
      </div>
    </div>
  `;

  const params = new URLSearchParams(window.location.search);
  if (params.get('autoPrint') === '1') {
    setTimeout(() => window.print(), 800);
  }
}

async function setupAuthUI() {
  const statusContainer = document.getElementById('authStatusContainer');
  if (!statusContainer) return;

  if (currentUser) {
    statusContainer.innerHTML = `
      <div class="d-flex align-items-center gap-2 text-white">
        <span class="small opacity-75">${currentUser.email || 'Admin'}</span>
        <button class="btn btn-sm btn-outline-light" onclick="logoutAdmin()">
          🚪 Logout
        </button>
      </div>
    `;
  }
}

async function setupHeader() {
  setupLogoUpload();
  updateSyncStatus();
  await setupAuthUI();
}

document.addEventListener('DOMContentLoaded', async () => {
  const isAdminPage = document.getElementById('adminTableBody') !== null;
  const isSalesPage = document.getElementById('products-container') !== null;
  initFirebase();

  if (isAdminPage) {
    const authed = await requireAdminAuth();
    if (!authed) return;
  } else {
    await checkAuth();
  }

  initProducts();
  initSales();
  initShifts();
  loadCart();
  await setupHeader();

  if (isSalesPage) {
    updateSalesPageShiftStatus();
    setInterval(updateSalesPageShiftStatus, 15000);
  }

  const productsContainer = document.getElementById('products-container');
  if (productsContainer) {
    renderProducts('Chicken');

    const tabChicken = document.getElementById('tab-chicken');
    const tabFish = document.getElementById('tab-fish');
    if (tabChicken) {
      tabChicken.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-tabs .nav-link').forEach(t => t.classList.remove('active'));
        tabChicken.classList.add('active');
        renderProducts('Chicken');
      });
    }
    if (tabFish) {
      tabFish.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-tabs .nav-link').forEach(t => t.classList.remove('active'));
        tabFish.classList.add('active');
        renderProducts('Fish');
      });
    }
  }

  if (document.getElementById('cart-items')) {
    renderCart();
    updateCartCount();
  }

  if (document.getElementById('adminTableBody')) {
    renderAllAdminUI();
  }

  if (document.getElementById('receiptContent')) {
    renderReceipt();
  }
});
