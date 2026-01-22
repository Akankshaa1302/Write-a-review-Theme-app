document.addEventListener("DOMContentLoaded", () => {
    const pageType = ShopifyAnalytics?.meta?.page?.pageType;
  
    // 1. Grab _all_ numeric inputs that look like quantity selectors
    function getAllQuantityInputs() {
      return Array.from(document.querySelectorAll("input[type='number']"))
        .filter(el =>
          ["quantity", "updates"].some(substr =>
            (el.getAttribute("name") || "").includes(substr)
          )
        );
    }
  
    // 2. Given an input element + its index in the list, figure out the right MOQ:
    function getMOQForInput(el, index) {
      // Product page: only one .quantity__input in <main>
      if (pageType === "product") {
        const tag = (productObject.productTag || [])
          .find(t => t.includes("MIN"));
        return tag ? parseInt(tag.split("_")[1], 10) : null;
      }
  
      // Cart context: cartItems.items is an array parallel to our inputs
      if (Array.isArray(cartItems?.items) && cartItems.items[index]) {
        const tag = cartItems.items[index].productTags
          .find(t => t.includes("MIN"));
        return tag ? parseInt(tag.split("_")[1], 10) : null;
      }
  
      return null;
    }
  
    // 3. Clamp one input to its MOQ
    function clampInput(el, index) {
      const moq = getMOQForInput(el, index);
      if (!moq) return;
  
      el.min = moq;
      if (parseInt(el.value, 10) < moq) {
        el.value = moq;
      }
    }
  
    // 4. Enforce MOQ on all matched inputs
    function enforceAllMOQ() {
      const inputs = getAllQuantityInputs();
      inputs.forEach(clampInput);
    }
  
    // 5. Watch for any user edits and re-apply clamps
    document.body.addEventListener("change", e => {
      if (e.target.matches("input[type='number']")) {
        enforceAllMOQ();
      }
    });
  
    // 6. Observe DOM mutations (lazy sections, cart-drawer updates, etc.)
    const observer = new MutationObserver(mutations => {
      // if any new <input type="number"> appears, re-clamp everything
      if (mutations.some(m =>
        Array.from(m.addedNodes).some(n =>
          n.nodeType === 1 &&
          n.matches &&
          n.matches("input[type='number']")
        )
      )) {
        enforceAllMOQ();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  
    // 7. Initial pass
    enforceAllMOQ();
  });
  