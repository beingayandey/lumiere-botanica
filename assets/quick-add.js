if (!customElements.get('quick-add-modal')) {
  customElements.define(
    'quick-add-modal',
    class QuickAddModal extends ModalDialog {
      constructor() {
        super();
        this.modalContent = this.querySelector('[id^="QuickAddInfo-"]');
      }

      hide(preventFocus = false) {
        const cartNotification = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        if (cartNotification) cartNotification.setActiveElement(this.openedBy);
        this.modalContent.innerHTML = '';

        if (preventFocus) this.openedBy = null;
        super.hide();
      }

      show(opener) {
        opener.setAttribute('aria-disabled', true);
        opener.classList.add('loading');
        opener.querySelector('.loading__spinner').classList.remove('hidden');

        this.modalContent.innerHTML = `
          <div class="quick-add-skeleton" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2.5rem; padding: 2rem;">
            <div class="skeleton-shimmer quick-add-skeleton__media" style="width: 100%; aspect-ratio: 1 / 1; border-radius: 8px;"></div>
            <div class="quick-add-skeleton__info" style="display: flex; flex-direction: column; gap: 1.4rem; justify-content: center;">
              <div class="skeleton-shimmer" style="width: 30%; height: 1.2rem; border-radius: 4px;"></div>
              <div class="skeleton-shimmer" style="width: 75%; height: 2.4rem; border-radius: 4px;"></div>
              <div class="skeleton-shimmer" style="width: 35%; height: 1.8rem; border-radius: 4px;"></div>
              <div class="skeleton-shimmer" style="width: 90%; height: 1.4rem; border-radius: 4px; margin-top: 1rem;"></div>
              <div class="skeleton-shimmer" style="width: 60%; height: 1.4rem; border-radius: 4px;"></div>
              <div class="skeleton-shimmer" style="width: 100%; height: 4.8rem; border-radius: 4px; margin-top: 1.5rem;"></div>
            </div>
          </div>
        `;
        super.show(opener);

        fetch(opener.getAttribute('data-product-url'))
          .then((response) => response.text())
          .then((responseText) => {
            const responseHTML = new DOMParser().parseFromString(responseText, 'text/html');
            this.productElement = responseHTML.querySelector('section[id^="MainProduct-"]');
            if (!this.productElement) return;
            this.productElement.classList.forEach((classApplied) => {
              if (classApplied.startsWith('color-') || classApplied === 'gradient')
                this.modalContent.classList.add(classApplied);
            });
            this.preventDuplicatedIDs();
            this.removeDOMElements();
            this.setInnerHTML(this.modalContent, this.productElement.innerHTML);

            if (window.Shopify && Shopify.PaymentButton) {
              Shopify.PaymentButton.init();
            }

            if (window.ProductModel) window.ProductModel.loadShopifyXR();

            this.removeGalleryListSemantic();
            this.updateImageSizes();
            this.preventVariantURLSwitching();
          })
          .catch((err) => {
            console.error('Quick view fetch error:', err);
            this.modalContent.innerHTML = '<div style="padding: 4rem; text-align: center;"><p>Unable to load product formulation.</p></div>';
          })
          .finally(() => {
            opener.removeAttribute('aria-disabled');
            opener.classList.remove('loading');
            opener.querySelector('.loading__spinner').classList.add('hidden');
            if (window.eboost != undefined) {
              window.eboost.countDown();
              window.eboost.initWishListIcons();
            }
          });
      }

      setInnerHTML(element, html) {
        element.innerHTML = html;

        // Reinjects the script tags to allow execution. By default, scripts are disabled when using element.innerHTML.
        element.querySelectorAll('script').forEach((oldScriptTag) => {
          const newScriptTag = document.createElement('script');
          Array.from(oldScriptTag.attributes).forEach((attribute) => {
            newScriptTag.setAttribute(attribute.name, attribute.value);
          });
          newScriptTag.appendChild(document.createTextNode(oldScriptTag.innerHTML));
          oldScriptTag.parentNode.replaceChild(newScriptTag, oldScriptTag);
        });
      }

      preventVariantURLSwitching() {
        const variantPicker = this.modalContent.querySelector('variant-selects');
        if (!variantPicker) return;

        variantPicker.setAttribute('data-update-url', 'false');
      }

      removeDOMElements() {
        const pickupAvailability = this.productElement.querySelector('pickup-availability');
        if (pickupAvailability) pickupAvailability.remove();

        const productModal = this.productElement.querySelector('product-modal');
        if (productModal) productModal.remove();

        const modalDialog = this.productElement.querySelectorAll('modal-dialog');
        if (modalDialog) modalDialog.forEach((modal) => modal.remove());
      }

      preventDuplicatedIDs() {
        const sectionId = this.productElement.dataset.section;
        this.productElement.innerHTML = this.productElement.innerHTML.replaceAll(sectionId, `quickadd-${sectionId}`);
        this.productElement.querySelectorAll('variant-selects, product-info').forEach((element) => {
          element.dataset.originalSection = sectionId;
        });
      }

      removeGalleryListSemantic() {
        const galleryList = this.modalContent.querySelector('[id^="Slider-Gallery"]');
        if (!galleryList) return;

        galleryList.setAttribute('role', 'presentation');
        galleryList.querySelectorAll('[id^="Slide-"]').forEach((li) => li.setAttribute('role', 'presentation'));
      }

      updateImageSizes() {
        const product = this.modalContent.querySelector('.product');
        const desktopColumns = product.classList.contains('product--columns');
        if (!desktopColumns) return;

        const mediaImages = product.querySelectorAll('.product__media img');
        if (!mediaImages.length) return;

        let mediaImageSizes =
          '(min-width: 1000px) 715px, (min-width: 750px) calc((100vw - 11.5rem) / 2), calc(100vw - 4rem)';

        if (product.classList.contains('product--medium')) {
          mediaImageSizes = mediaImageSizes.replace('715px', '605px');
        } else if (product.classList.contains('product--small')) {
          mediaImageSizes = mediaImageSizes.replace('715px', '495px');
        }

        mediaImages.forEach((img) => img.setAttribute('sizes', mediaImageSizes));
      }
    }
  );
}
