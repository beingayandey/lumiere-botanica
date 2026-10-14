/**
 * Lumière Botanica — Beauty Routine Builder
 * Guided Skincare Questionnaire & Product Matching Engine
 */
(function() {
  'use strict';

  var state = {
    currentStep: 1,
    skinType: null,
    concern: null,
    routinePreference: 'simple',
    products: []
  };

  // Safe money formatting helper
  function formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents, window.moneyFormat || 'Rs. {{amount}}');
    }
    var unit = window.currency_unit || 'Rs.';
    return unit + ' ' + (cents / 100).toFixed(2);
  }

  // Load products from embedded JSON tag with fallback to /products.json
  async function loadProducts() {
    var embeddedTag = document.getElementById('RoutineBuilderProducts');
    if (embeddedTag && embeddedTag.textContent.trim()) {
      try {
        var parsed = JSON.parse(embeddedTag.textContent);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.products = parsed;
          return;
        }
      } catch (e) {
        console.warn('[RoutineBuilder] Could not parse embedded products, fetching /products.json', e);
      }
    }

    try {
      var res = await fetch('/products.json?limit=50');
      var data = await res.json();
      state.products = (data.products || []).map(function(p) {
        var firstVariant = (p.variants && p.variants[0]) || {};
        var priceCents = Math.round(parseFloat(firstVariant.price || 0) * 100);
        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          url: '/products/' + p.handle,
          product_type: p.product_type,
          tags: p.tags || [],
          featured_image: (p.images && p.images[0] && p.images[0].src) || '',
          available: firstVariant.available !== false,
          price: formatMoney(priceCents),
          price_raw: priceCents,
          variants: (p.variants || []).map(function(v) {
            var vCents = Math.round(parseFloat(v.price || 0) * 100);
            return {
              id: v.id,
              title: v.title,
              price: formatMoney(vCents),
              price_raw: vCents,
              available: v.available !== false
            };
          })
        };
      });
    } catch (err) {
      console.error('[RoutineBuilder] Error loading products:', err);
    }
  }

  // =========================================================================
  // =========================================================================
  // Product Matching Engine (Deterministic, Attribute & Tag Driven)
  // =========================================================================

  var STEP_CONFIGS = {
    cleanse: {
      stepTitle: 'Cleanse',
      allowedTypes: ['Facial Cleanser', 'Exfoliator'],
      fallbackTags: ['cleansers'],
      defaultRationale: 'gentle botanical cleansing without stripping moisture'
    },
    tone: {
      stepTitle: 'Tone & Prep',
      allowedTypes: ['Facial Toner'],
      fallbackTags: ['Toner', 'Essence'],
      defaultRationale: 'pH-balancing botanical floral essence to prep absorption'
    },
    treat: {
      stepTitle: 'Target & Treat',
      allowedTypes: ['Face Serum', 'Facial Oil'],
      fallbackTags: ['serums'],
      defaultRationale: 'potent botanical active infusion targeting specific skin goals'
    },
    moisturize: {
      stepTitle: 'Hydrate & Seal',
      allowedTypes: ['Daily Moisturizer', 'Night Treatment'],
      fallbackTags: ['moisturizers'],
      defaultRationale: 'nourishing botanical lipid replenishment to protect skin barrier'
    },
    protect: {
      stepTitle: 'Protect',
      allowedTypes: ['Sun Protection'],
      fallbackTypes: ['Foundation & Tint'],
      fallbackTags: ['SPF 50', 'SPF 30'],
      defaultRationale: 'broad-spectrum clean mineral defense against daily environmental exposure'
    }
  };

  function hasTag(product, tagKeyword) {
    if (!product || !product.tags) return false;
    var target = tagKeyword.toLowerCase();
    return product.tags.some(function(t) {
      return t.toLowerCase().indexOf(target) !== -1;
    });
  }

  function matchesType(product, typeKeyword) {
    if (!product || !product.product_type) return false;
    return product.product_type.toLowerCase().indexOf(typeKeyword.toLowerCase()) !== -1;
  }

  function scoreProduct(product, stepConfig, skinType, concern) {
    var score = 0;
    var reasons = [];

    // Strict Category Match
    var isPrimaryType = stepConfig.allowedTypes && stepConfig.allowedTypes.some(function(t) {
      return matchesType(product, t);
    });

    if (isPrimaryType) {
      score += 30; // Primary category type match
    } else if (stepConfig.fallbackTypes && stepConfig.fallbackTypes.some(function(t) { return matchesType(product, t); })) {
      score += 15;
    } else if (stepConfig.fallbackTags && stepConfig.fallbackTags.some(function(t) { return hasTag(product, t); })) {
      // Must not belong to an opposing primary category
      if (stepConfig.allowedTypes.indexOf('Facial Cleanser') !== -1 && matchesType(product, 'Facial Toner')) {
        return null;
      }
      score += 10;
    } else {
      return null;
    }

    // Availability bonus (strongly favor in-stock)
    if (product.available) {
      score += 15;
    }

    // Skin type matching
    if (skinType === 'sensitive' && (hasTag(product, 'Sensitive Skin') || hasTag(product, 'Fragrance Free'))) {
      score += 8;
      reasons.push('tag [Sensitive Skin / Fragrance Free] for calm barrier protection');
    } else if (skinType === 'oily' && (hasTag(product, 'Oily Skin') || hasTag(product, 'Pores'))) {
      score += 8;
      reasons.push('tag [Oily Skin / Pores] to balance excess sebum');
    } else if (skinType === 'dry' && (hasTag(product, 'Hydrating') || hasTag(product, 'moisturizers') || matchesType(product, 'Daily Moisturizer'))) {
      score += 7;
      reasons.push('nourishing lipid-replenishing profile for dry skin');
    } else if (skinType === 'combination' && (hasTag(product, 'Organic') || hasTag(product, 'Clean Beauty'))) {
      score += 5;
      reasons.push('clean botanical blend suitable for dual-zone skin');
    } else if (skinType === 'normal' && (hasTag(product, 'Organic') || hasTag(product, 'Clean Beauty') || hasTag(product, 'best-sellers'))) {
      score += 4;
      reasons.push('versatile daily botanical maintenance');
    }

    // Concern matching
    if (concern === 'hydration' && hasTag(product, 'Hydrating')) {
      score += 12;
      reasons.push('tag [Hydrating] to infuse cellular moisture');
    } else if (concern === 'dryness' && (hasTag(product, 'Hydrating') || hasTag(product, 'moisturizers') || hasTag(product, 'Anti-Aging'))) {
      score += 12;
      reasons.push('moisture-sealing ceramides and plant lipids');
    } else if (concern === 'oiliness' && (hasTag(product, 'Pores') || hasTag(product, 'Oily Skin') || hasTag(product, 'Exfoliant'))) {
      score += 12;
      reasons.push('clarifying botanical actives to refine pores');
    } else if (concern === 'dullness' && (hasTag(product, 'Brightening') || hasTag(product, 'Vitamin C'))) {
      score += 12;
      reasons.push('tag [Brightening / Vitamin C] to revive radiance');
    } else if (concern === 'uneven texture' && (hasTag(product, 'Exfoliant') || hasTag(product, 'Anti-Aging') || hasTag(product, 'Pores'))) {
      score += 12;
      reasons.push('exfoliating and cell-renewing botanical actives');
    }

    return {
      product: product,
      score: score,
      reasons: reasons
    };
  }

  function pickBestProduct(stepKey, skinType, concern, stepNumber, usedProductIds) {
    var stepConfig = STEP_CONFIGS[stepKey];
    if (!stepConfig) return null;

    var candidates = [];
    state.products.forEach(function(product) {
      if (usedProductIds.has(product.id)) return; // Prevent duplicate product in same routine
      var scored = scoreProduct(product, stepConfig, skinType, concern);
      if (scored) candidates.push(scored);
    });

    if (candidates.length === 0) {
      // Fallback: Pick any unused product matching allowed types
      var fallback = state.products.find(function(p) {
        if (usedProductIds.has(p.id)) return false;
        return stepConfig.allowedTypes.some(function(t) { return matchesType(p, t); });
      });

      if (!fallback) return null;

      usedProductIds.add(fallback.id);
      return {
        stepNumber: stepNumber,
        stepTitle: stepConfig.stepTitle,
        product: fallback,
        isFallback: true,
        reason: 'Essential Routine Step: ' + fallback.title + ' is recommended as your ' + stepConfig.stepTitle.toLowerCase() + ' step. (Note: Explicit [' + concern + '] tags are not listed on this product, but formula provides ' + stepConfig.defaultRationale + ').'
      };
    }

    // Sort by highest score, then in-stock
    candidates.sort(function(a, b) {
      if (a.product.available !== b.product.available) {
        return b.product.available ? 1 : -1;
      }
      return b.score - a.score;
    });

    var best = candidates[0];
    usedProductIds.add(best.product.id);

    var reasonText = '';
    var isFallback = best.reasons.length === 0;

    if (isFallback) {
      reasonText = 'Essential Routine Step: ' + best.product.title + ' is recommended as your ' + stepConfig.stepTitle.toLowerCase() + ' step. (Note: Explicit [' + concern + '] tags are not listed on this product, but formula provides ' + stepConfig.defaultRationale + ').';
    } else {
      reasonText = 'Why this formula: Selected for ' + skinType + ' skin and ' + concern + ' focus based on ' + best.reasons.join(' and ') + '.';
    }

    return {
      stepNumber: stepNumber,
      stepTitle: stepConfig.stepTitle,
      product: best.product,
      isFallback: isFallback,
      reason: reasonText
    };
  }

  function generateRoutine() {
    var skinType = state.skinType || 'normal';
    var concern = state.concern || 'hydration';
    var routine = [];
    var usedProductIds = new Set();
    var stepNum = 1;

    // Step 1: Cleanser
    var cleanser = pickBestProduct('cleanse', skinType, concern, stepNum++, usedProductIds);
    if (cleanser) routine.push(cleanser);

    // Step 2 (if extended): Toner / Essence
    if (state.routinePreference === 'extended') {
      var toner = pickBestProduct('tone', skinType, concern, stepNum++, usedProductIds);
      if (toner) routine.push(toner);
    }

    // Step 3: Targeted Treatment Serum
    var serum = pickBestProduct('treat', skinType, concern, stepNum++, usedProductIds);
    if (serum) routine.push(serum);

    // Step 4: Daily Moisturizer
    var moisturizer = pickBestProduct('moisturize', skinType, concern, stepNum++, usedProductIds);
    if (moisturizer) routine.push(moisturizer);

    // Step 5: Sun Protection / SPF
    var spf = pickBestProduct('protect', skinType, concern, stepNum++, usedProductIds);
    if (spf) routine.push(spf);

    return routine;
  }

  // =========================================================================
  // DOM Rendering & Questionnaire Flow
  // =========================================================================

  function updateProgress() {
    var fill = document.getElementById('RoutineProgressFill');
    var label = document.getElementById('RoutineStepLabel');
    var stepsText = document.getElementById('RoutineStepTracker');

    var pct = 33.33;
    if (state.currentStep === 2) pct = 66.66;
    if (state.currentStep === 3) pct = 100;
    if (state.currentStep > 3) pct = 100;

    if (fill) fill.style.width = pct + '%';
    if (label) {
      if (state.currentStep <= 3) {
        label.textContent = 'Step ' + state.currentStep + ' of 3';
      } else {
        label.textContent = 'Your Tailored Routine';
      }
    }
  }

  function showStep(stepNumber) {
    state.currentStep = stepNumber;
    updateProgress();

    var steps = document.querySelectorAll('.routine-step');
    steps.forEach(function(el) {
      el.classList.remove('active');
    });

    var targetStep = document.getElementById('RoutineStep' + stepNumber);
    if (targetStep) {
      targetStep.classList.add('active');
    }

    var quizBox = document.getElementById('RoutineQuizBox');
    var resultsBox = document.getElementById('RoutineResultsBox');

    if (stepNumber <= 3) {
      if (quizBox) quizBox.style.display = 'block';
      if (resultsBox) {
        resultsBox.style.display = 'none';
        resultsBox.classList.remove('active');
      }
    } else {
      if (quizBox) quizBox.style.display = 'none';
      renderResults();
    }
  }

  function renderResults() {
    var resultsBox = document.getElementById('RoutineResultsBox');
    if (!resultsBox) return;

    var routine = generateRoutine();

    // Summary profile badges
    var summaryBadges = document.getElementById('RoutineProfileBadges');
    if (summaryBadges) {
      summaryBadges.innerHTML = [
        '<div class="routine-profile-badge">Skin Type: <strong>' + (state.skinType || 'Normal') + '</strong></div>',
        '<div class="routine-profile-badge">Concern: <strong>' + (state.concern || 'Hydration') + '</strong></div>',
        '<div class="routine-profile-badge">Ritual: <strong>' + (state.routinePreference === 'extended' ? 'Extended (5 Steps)' : 'Essential (4 Steps)') + '</strong></div>'
      ].join('');
    }

    // Render Steps
    var stepsContainer = document.getElementById('RoutineStepsList');
    var bundleTotal = 0;
    var bundleItems = [];

    if (stepsContainer) {
      if (state.products.length === 0) {
        var skeletonHtml = '';
        var stepCount = state.routinePreference === 'extended' ? 5 : 4;
        for (var i = 1; i <= stepCount; i++) {
          skeletonHtml += '<div class="routine-card routine-card--skeleton" aria-hidden="true">' +
            '<div class="routine-card__image-wrap">' +
              '<div class="skeleton-shimmer" style="width: 100%; height: 200px; border-radius: 8px;"></div>' +
            '</div>' +
            '<div class="routine-card__info">' +
              '<div class="skeleton-shimmer" style="width: 25%; height: 1.2rem; margin-bottom: 0.8rem; border-radius: 3px;"></div>' +
              '<div class="skeleton-shimmer" style="width: 70%; height: 2rem; margin-bottom: 0.8rem; border-radius: 3px;"></div>' +
              '<div class="skeleton-shimmer" style="width: 30%; height: 1.4rem; margin-bottom: 1.2rem; border-radius: 3px;"></div>' +
              '<div class="skeleton-shimmer" style="width: 90%; height: 3.6rem; border-radius: 6px;"></div>' +
            '</div>' +
            '<div class="routine-card__actions">' +
              '<div class="skeleton-shimmer" style="width: 100%; height: 4.8rem; border-radius: 4px;"></div>' +
            '</div>' +
          '</div>';
        }
        stepsContainer.innerHTML = skeletonHtml;
        return;
      } else if (routine.length === 0) {
        stepsContainer.innerHTML = '<div class="routine-empty-state"><h3>No Matching Formulations Found</h3><p>We could not find active products matching this exact combination. Please adjust your answers or explore our full botanical catalog.</p><button type="button" class="routine-btn routine-btn--primary" id="btnRestartEmpty">Restart Routine Quiz</button></div>';
      } else {
        var html = '';
        routine.forEach(function(item) {
          var p = item.product;
          var primaryVariant = (p.variants && p.variants[0]) || {};
          if (p.available && primaryVariant.available) {
            bundleTotal += (primaryVariant.price_raw || p.price_raw || 0);
            bundleItems.push({
              id: primaryVariant.id,
              quantity: 1
            });
          }

          var reasonClass = item.isFallback ? 'routine-card__match-reason routine-card__match-reason--fallback' : 'routine-card__match-reason';

          html += '<div class="routine-card" data-product-handle="' + p.handle + '">';
          html += '  <div class="routine-card__image-wrap">';
          html += '    <span class="routine-card__step-pill">Step ' + item.stepNumber + ': ' + item.stepTitle + '</span>';
          if (p.featured_image) {
            html += '    <img src="' + p.featured_image + '" alt="' + p.title + '" width="240" height="240" class="routine-card__image" loading="lazy">';
          }
          html += '  </div>';
          html += '  <div class="routine-card__info">';
          html += '    <span class="routine-card__category">' + (p.product_type || 'Skincare') + '</span>';
          html += '    <h3 class="routine-card__title"><a href="' + p.url + '">' + p.title + '</a></h3>';
          html += '    <div class="routine-card__price-row">';
          html += '      <span class="routine-card__price">' + p.price + '</span>';
          html += '      <span class="routine-card__availability ' + (p.available ? 'routine-card__availability--in-stock' : 'routine-card__availability--sold-out') + '">' + (p.available ? 'In Stock' : 'Sold Out') + '</span>';
          html += '    </div>';
          html += '    <div class="' + reasonClass + '">';
          html += '      <span>' + item.reason + '</span>';
          html += '    </div>';
          html += '  </div>';

          html += '  <div class="routine-card__actions">';
          if (p.variants && p.variants.length > 1) {
            html += '    <select class="routine-card__select" data-variant-select aria-label="Select variant for ' + p.title + '">';
            p.variants.forEach(function(v) {
              html += '      <option value="' + v.id + '"' + (v.available ? '' : ' disabled') + '>' + v.title + ' - ' + v.price + (v.available ? '' : ' (Sold Out)') + '</option>';
            });
            html += '    </select>';
          }
          html += '    <button type="button" class="routine-btn routine-btn--primary btn-add-single" data-variant-id="' + primaryVariant.id + '"' + (p.available ? '' : ' disabled') + '>';
          html += p.available ? 'Add to Cart' : 'Sold Out';
          html += '    </button>';
          html += '    <a href="' + p.url + '" class="routine-btn routine-btn--secondary" style="font-size: 1.2rem; min-height: 3.8rem; padding: 0.8rem 1.6rem;">Inspect Details</a>';
          html += '  </div>';
          html += '</div>';
        });
        stepsContainer.innerHTML = html;
      }
    }

    // Bundle checkout display
    var totalEl = document.getElementById('RoutineBundleTotal');
    if (totalEl) totalEl.textContent = formatMoney(bundleTotal);

    var btnBundle = document.getElementById('btnRoutineAddBundle');
    if (btnBundle) {
      btnBundle.disabled = bundleItems.length === 0;
      btnBundle.setAttribute('data-bundle-items', JSON.stringify(bundleItems));
    }

    resultsBox.style.display = 'block';
    resultsBox.classList.add('active');

    // Scroll to results cleanly
    resultsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =========================================================================
  // Cart Actions & Event Handlers
  // =========================================================================

  function addSingleItemToCart(variantId, buttonEl) {
    if (!variantId) return;
    var originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Adding...';

    fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        id: variantId,
        quantity: 1,
        sections: ['cart-drawer', 'cart-icon-bubble']
      })
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Could not add to cart');
      return res.json();
    })
    .then(function(addedItem) {
      buttonEl.textContent = 'Added ✓';
      setTimeout(function() {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
      }, 1800);

      // Trigger pubsub cartUpdate
      if (typeof publish === 'function' && window.PUB_SUB_EVENTS) {
        publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'routine-builder', cartData: addedItem });
      }

      // Open drawer if enabled
      var cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer && typeof cartDrawer.open === 'function') {
        cartDrawer.open();
      }
    })
    .catch(function(err) {
      console.error(err);
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
      alert('Could not add item to cart. Please try again.');
    });
  }

  async function addEntireRoutineToCart(buttonEl) {
    var raw = buttonEl.getAttribute('data-bundle-items');
    if (!raw) return;
    var items = [];
    try {
      items = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (items.length === 0) return;

    var originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Adding Routine...';

    try {
      // Add items sequentially or batch to cart
      var res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          items: items,
          sections: ['cart-drawer', 'cart-icon-bubble']
        })
      });

      if (!res.ok) throw new Error('Could not bundle add');
      var cartData = await res.json();

      buttonEl.textContent = 'Routine Added ✓';
      setTimeout(function() {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
      }, 2000);

      if (typeof publish === 'function' && window.PUB_SUB_EVENTS) {
        publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'routine-builder-bundle', cartData: cartData });
      }

      var cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer && typeof cartDrawer.open === 'function') {
        cartDrawer.open();
      }
    } catch (err) {
      console.error(err);
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
      alert('Could not add routine to cart. Please try individual additions.');
    }
  }

  function restartQuiz() {
    state.currentStep = 1;
    state.skinType = null;
    state.concern = null;
    state.routinePreference = 'simple';

    // Deselect all cards
    document.querySelectorAll('.routine-option-card').forEach(function(card) {
      card.classList.remove('selected');
      card.setAttribute('aria-checked', 'false');
      var inp = card.querySelector('input');
      if (inp) inp.checked = false;
    });

    // Disable Next buttons
    var next1 = document.getElementById('btnNextStep1');
    var next2 = document.getElementById('btnNextStep2');
    if (next1) next1.disabled = true;
    if (next2) next2.disabled = true;

    showStep(1);
    var quizBox = document.getElementById('RoutineQuizBox');
    if (quizBox) quizBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =========================================================================
  // Setup & Event Listeners
  // =========================================================================

  function initRoutineBuilder() {
    loadProducts();

    // Option Card Selection
    document.addEventListener('click', function(e) {
      var card = e.target.closest('.routine-option-card');
      if (!card) return;

      var step = card.closest('.routine-step');
      if (!step) return;

      var group = card.getAttribute('data-group');
      var val = card.getAttribute('data-value');

      // Unselect siblings
      step.querySelectorAll('.routine-option-card[data-group="' + group + '"]').forEach(function(c) {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
        var input = c.querySelector('input');
        if (input) input.checked = false;
      });

      // Select clicked
      card.classList.add('selected');
      card.setAttribute('aria-checked', 'true');
      var myInput = card.querySelector('input');
      if (myInput) myInput.checked = true;

      // Update state & buttons
      if (group === 'skin-type') {
        state.skinType = val;
        var btn1 = document.getElementById('btnNextStep1');
        if (btn1) btn1.disabled = false;
      } else if (group === 'concern') {
        state.concern = val;
        var btn2 = document.getElementById('btnNextStep2');
        if (btn2) btn2.disabled = false;
      } else if (group === 'routine-preference') {
        state.routinePreference = val;
      }
    });

    // Keyboard navigation (Enter / Space)
    document.addEventListener('keydown', function(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        var card = e.target.closest('.routine-option-card');
        if (card) {
          e.preventDefault();
          card.click();
        }
      }
    });

    // Step Nav Buttons
    var btnNext1 = document.getElementById('btnNextStep1');
    if (btnNext1) {
      btnNext1.addEventListener('click', function() {
        if (state.skinType) showStep(2);
      });
    }

    var btnBack2 = document.getElementById('btnBackStep2');
    if (btnBack2) {
      btnBack2.addEventListener('click', function() {
        showStep(1);
      });
    }

    var btnNext2 = document.getElementById('btnNextStep2');
    if (btnNext2) {
      btnNext2.addEventListener('click', function() {
        if (state.concern) showStep(3);
      });
    }

    var btnBack3 = document.getElementById('btnBackStep3');
    if (btnBack3) {
      btnBack3.addEventListener('click', function() {
        showStep(2);
      });
    }

    var btnFinish = document.getElementById('btnFinishQuiz');
    if (btnFinish) {
      btnFinish.addEventListener('click', function() {
        showStep(4); // Shows results
      });
    }

    // Restart buttons
    document.addEventListener('click', function(e) {
      if (e.target.closest('.routine-btn-restart, #btnRestartEmpty')) {
        e.preventDefault();
        restartQuiz();
      }
    });

    // Variant selector in routine card
    document.addEventListener('change', function(e) {
      if (e.target.matches('.routine-card__select')) {
        var card = e.target.closest('.routine-card');
        var btn = card ? card.querySelector('.btn-add-single') : null;
        if (btn) btn.setAttribute('data-variant-id', e.target.value);
      }
    });

    // Single item add to cart
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.btn-add-single');
      if (btn) {
        e.preventDefault();
        var variantId = btn.getAttribute('data-variant-id');
        addSingleItemToCart(variantId, btn);
      }
    });

    // Bundle add to cart
    var btnBundle = document.getElementById('btnRoutineAddBundle');
    if (btnBundle) {
      btnBundle.addEventListener('click', function(e) {
        e.preventDefault();
        addEntireRoutineToCart(btnBundle);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRoutineBuilder);
  } else {
    initRoutineBuilder();
  }
})();
