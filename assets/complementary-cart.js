/**
 * Complementary Botanical Product Recommendations for Cart Drawer & Cart Page
 * Lumière Botanica Skincare Store
 */
(function() {
  'use strict';

  function formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents, window.moneyFormat || 'Rs. {{amount}}');
    }
    var unit = window.currency_unit || 'Rs.';
    return unit + ' ' + (cents / 100).toFixed(2);
  }

  function getCartItemIds(cart) {
    var ids = new Set();
    if (cart && cart.items) {
      cart.items.forEach(function(item) {
        ids.add(item.product_id);
        ids.add(item.id);
        if (item.handle) ids.add(item.handle);
      });
    }
    return ids;
  }

  function renderRecommendations(container, products, cartIds) {
    if (!container) return;
    
    // Filter out products already in cart
    var available = products.filter(function(p) {
      return !cartIds.has(p.id) && !cartIds.has(p.handle);
    }).slice(0, 3);

    if (available.length === 0) {
      var wrap = container.closest('.cart-drawer__complementary, .cart-page__complementary');
      if (wrap) wrap.style.display = 'none';
      return;
    }

    var wrapEl = container.closest('.cart-drawer__complementary, .cart-page__complementary');
    if (wrapEl) wrapEl.style.display = 'block';

    var html = '';
    available.forEach(function(product) {
      var variant = (product.variants && product.variants[0]) || {};
      var img = product.featured_image || (product.images && product.images[0]) || '';
      var price = variant.price ? formatMoney(variant.price) : '';
      var isAvailable = variant.available !== false;

      html += '<div class="complementary-card" data-product-handle="' + product.handle + '" style="display: flex; align-items: center; justify-content: space-between; padding: 0.8rem; background: #fff; border-radius: 6px; border: 1px solid rgba(39, 75, 79, 0.08); gap: 1rem;">' +
        '<div style="display: flex; align-items: center; gap: 1rem; min-width: 0;">' +
          '<a href="' + product.url + '" style="flex-shrink: 0; width: 56px; height: 56px; border-radius: 4px; overflow: hidden; background: #fafafa; display: flex; align-items: center; justify-content: center;">' +
            '<img src="' + img + '" alt="' + (product.title || '').replace(/"/g, '&quot;') + '" style="max-width: 100%; max-height: 100%; object-fit: cover;" loading="lazy">' +
          '</a>' +
          '<div style="min-width: 0;">' +
            '<h4 style="font-size: 1.25rem; font-weight: 600; margin: 0 0 0.3rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' +
              '<a href="' + product.url + '" style="color: var(--color-foreground); text-decoration: none;">' + product.title + '</a>' +
            '</h4>' +
            '<div style="font-size: 1.2rem; font-weight: 600; color: #274b4f;">' + price + '</div>' +
          '</div>' +
        '</div>' +
        '<div>' +
          (isAvailable 
            ? '<button type="button" class="btn-add-complementary button button--secondary" data-variant-id="' + variant.id + '" aria-label="Add ' + (product.title || '').replace(/"/g, '&quot;') + ' to cart" style="padding: 0.5rem 1.2rem; font-size: 1.2rem; border-radius: 4px; white-space: nowrap; min-height: 3.2rem; line-height: 1.2;">+ Add</button>'
            : '<span style="font-size: 1.1rem; color: #888;">Sold out</span>'
          ) +
        '</div>' +
      '</div>';
    });

    container.innerHTML = html;
  }

  function fetchAndRenderRecommendations() {
    var containers = document.querySelectorAll('.cart-complementary-items');
    if (!containers.length) return;

    var routerPrefix = window.router || '';
    if (routerPrefix === '/') routerPrefix = '';

    fetch(routerPrefix + '/cart.js')
      .then(function(res) { return res.json(); })
      .then(function(cart) {
        var cartIds = getCartItemIds(cart);
        var fetchUrl = '';

        if (cart.items && cart.items.length > 0) {
          var firstProductId = cart.items[0].product_id;
          fetchUrl = routerPrefix + '/recommendations/products.json?product_id=' + firstProductId + '&limit=4&intent=related';
        } else {
          fetchUrl = routerPrefix + '/collections/all/products.json?limit=6';
        }

        fetch(fetchUrl)
          .then(function(res) { return res.json(); })
          .then(function(data) {
            var products = data.products || [];
            if (products.length < 2 && cart.items && cart.items.length > 0) {
              // Fallback to store collection if recommendations returned < 2
              fetch(routerPrefix + '/collections/all/products.json?limit=6')
                .then(function(r) { return r.json(); })
                .then(function(fallback) {
                  var combined = products.concat(fallback.products || []);
                  containers.forEach(function(c) { renderRecommendations(c, combined, cartIds); });
                });
            } else {
              containers.forEach(function(c) { renderRecommendations(c, products, cartIds); });
            }
          })
          .catch(function(err) {
            console.warn('Botanical recommendations unavailable:', err);
          });
      })
      .catch(function(err) {
        console.warn('Cart lookup failed:', err);
      });
  }

  // Handle "+ Add" action on complementary items
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-add-complementary');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    var variantId = btn.getAttribute('data-variant-id');
    if (!variantId) return;

    var originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner" style="display:inline-block;width:12px;height:12px;border:2px solid #274b4f;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;vertical-align:middle;margin-right:4px;"></span> Adding...';

    var routerPrefix = window.router || '';
    if (routerPrefix === '/') routerPrefix = '';

    fetch(routerPrefix + '/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        id: parseInt(variantId, 10),
        quantity: 1
      })
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to add product');
      return res.json();
    })
    .then(function(addedItem) {
      btn.innerHTML = '✓ Added';
      btn.style.backgroundColor = '#4a7c59';
      btn.style.color = '#fff';
      btn.style.borderColor = '#4a7c59';

      setTimeout(function() {
        var card = btn.closest('.complementary-card');
        if (card) {
          card.style.transition = 'opacity 0.3s ease';
          card.style.opacity = '0';
          setTimeout(function() { card.remove(); }, 300);
        }
      }, 700);

      // Trigger Cart Drawer / Cart Items update
      var cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer && typeof cartDrawer.onCartUpdate === 'function') {
        cartDrawer.onCartUpdate();
      }

      var cartDrawerItems = document.querySelector('cart-drawer-items');
      if (cartDrawerItems && typeof cartDrawerItems.onCartUpdate === 'function') {
        cartDrawerItems.onCartUpdate();
      }

      // If on cart page, trigger CartItems
      var cartItems = document.querySelector('cart-items');
      if (cartItems && typeof cartItems.onCartUpdate === 'function') {
        cartItems.onCartUpdate();
      }

      // Refresh Quickview if open
      var quickviewWrapper = document.querySelector('data-cart-wrapper');
      if (quickviewWrapper && typeof quickviewWrapper.onCartUpdate === 'function') {
        quickviewWrapper.onCartUpdate();
      }

      // Dispatch global pubSub cartUpdate event
      if (typeof publish === 'function' && window.PUB_SUB_EVENTS) {
        publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'complementary-cart', cartData: addedItem });
      }

      // Update shipping progress bar
      if (window.eboost && typeof window.eboost.progressBar === 'function') {
        setTimeout(function() { window.eboost.progressBar(); }, 300);
      }

      // Update cart bubble counts
      fetch(routerPrefix + '/cart.js')
        .then(function(r) { return r.json(); })
        .then(function(c) {
          document.querySelectorAll('[data-cart-count], .cart-quantity').forEach(function(el) {
            el.textContent = c.item_count;
          });
        });
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.innerHTML = originalText;
      alert('Could not add to cart. Product may be unavailable.');
    });
  });

  // Initialize on DOM load or immediately if already loaded
  function init() {
    fetchAndRenderRecommendations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (typeof subscribe === 'function' && window.PUB_SUB_EVENTS) {
    subscribe(window.PUB_SUB_EVENTS.cartUpdate, function() {
      setTimeout(fetchAndRenderRecommendations, 400);
    });
  }

  // Expose globally
  window.BotanicalComplementary = { init: fetchAndRenderRecommendations };
  window.refreshCartRecommendations = fetchAndRenderRecommendations;
})();
