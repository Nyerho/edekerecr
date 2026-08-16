let products = [];
let cart = [];
let salesHistory = [];
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

async function syncAllToFirestore() {
  if (!currentUser) return;
  await syncProductsToFirestore();
  await syncSalesToFirestore();
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

async function onAuthStateChange() {
  if (!firebaseAuth) return;
  return new Promise((resolve) => {
    firebaseAuth.onAuthStateChanged((user) => {
      currentUser = user;
      saveToStorage(STORAGE_KEYS.AUTH_USER, user ? { uid: user.uid, email: user.email } : null);
      resolve(user);
    });
  });
}

async function checkAuth(required = false) {
  if (!firebaseAuth) {
    currentUser = loadFromStorage(STORAGE_KEYS.AUTH_USER, null);
    return currentUser;
  }
  const user = await onAuthStateChange();
  return user;
}

async function requireAdminAuth() {
  const user = await checkAuth();
  if (!user) {
    window.location.href = 'login.html?redirect=admin.html';
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
  return await firebaseAuth.signInWithEmailAndPassword(email, password);
}

async function logoutAdmin() {
  if (firebaseAuth && currentUser) {
    await firebaseAuth.signOut();
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

function refreshProductUI() {
  if (document.getElementById('products-container')) {
    const activeTab = document.querySelector('.nav-tabs .nav-link.active');
    const category = activeTab?.id === 'tab-fish' ? 'Fish' : 'Chicken';
    renderProducts(category);
  }
  if (document.getElementById('adminTableBody')) {
    renderAdminTable();
  }
}

function initSales() {
  salesHistory = loadFromStorage(STORAGE_KEYS.SALES, []);
  return salesHistory;
}

function saveProducts() {
  saveToStorage(STORAGE_KEYS.PRODUCTS, products);
  if (currentUser) syncProductsToFirestore();
}

function saveSales() {
  saveToStorage(STORAGE_KEYS.SALES, salesHistory);
  if (currentUser) syncSalesToFirestore();
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

function completeSale() {
  if (cart.length === 0) return null;

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
    items: JSON.parse(JSON.stringify(cart)),
    total: calculateTotal()
  };

  salesHistory.unshift(sale);
  saveSales();

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
      qty = product.stock;
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

  const modal = bootstrap.Modal.getInstance(document.getElementById('productModal'));
  modal.hide();
  currentProduct = null;
}

function handleCompleteSale() {
  if (cart.length === 0) {
    alert('Your cart is empty!');
    return;
  }

  const sale = completeSale();
  if (sale) {
    clearCart();
    renderCart();
    window.location.href = 'receipt.html';
  }
}

function handlePrintReceipt() {
  if (cart.length === 0) {
    alert('Your cart is empty!');
    return;
  }
  const sale = completeSale();
  if (sale) {
    clearCart();
    window.location.href = 'receipt.html?autoPrint=1';
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

  renderAdminTable();
  const modal = bootstrap.Modal.getInstance(document.getElementById('productFormModal'));
  modal.hide();
  return false;
}

function confirmDelete(id) {
  const product = getProductById(id);
  if (!product) return;
  if (confirm(`Are you sure you want to delete "${product.name}"? This cannot be undone.`)) {
    deleteProduct(id);
    renderAdminTable();
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
  initFirebase();

  if (isAdminPage) {
    const authed = await requireAdminAuth();
    if (!authed) return;
  } else {
    await checkAuth();
  }

  initProducts();
  initSales();
  loadCart();
  await setupHeader();

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
  }

  if (document.getElementById('adminTableBody')) {
    renderAdminTable();
  }

  if (document.getElementById('receiptContent')) {
    renderReceipt();
  }
});
