document.addEventListener("DOMContentLoaded", function () {
  const { createApp, ref, computed } = Vue;

  const app = createApp({
    setup() {
      const vendor = ref((window.productVendor || "").trim());

      const baseUrl = ref(
        (window.vendorPageBaseUrl || "").trim() || "/pages/shop-by-vendor#/"
      );

      const profileUrl = computed(
        () => baseUrl.value + vendor.value.replace(/&/g, "%26")
      );

      return { vendor, profileUrl };
    },

    template: `
      <a
        v-if="vendor"
        :href="profileUrl"
        style="text-decoration:none;color:inherit;"
      >
        <p style="margin:0;color:inherit;">$% vendor %</p>
      </a>
    `,
  });

  app.config.compilerOptions.delimiters = ["$%", "%"];
  app.mount("#vendor-profile-link");
});
