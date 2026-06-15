document.addEventListener("DOMContentLoaded", function () {
  const mount = document.getElementById("vendor-profile-link");
  if (!mount) return;

  const vendor = (window.productVendor || "").trim();
  if (!vendor) return;

  const rawBaseUrl =
    (window.vendorPageBaseUrl || "").trim() || "/pages/shop-by-vendor#/";
  const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl : rawBaseUrl + "/";

  const link = document.createElement("a");
  link.href = baseUrl + vendor.replace(/&/g, "%26");
  link.style.textDecoration = "none";
  link.style.color = "inherit";

  const text = document.createElement("p");
  text.style.margin = "0";
  text.style.color = "inherit";
  text.textContent = vendor;

  link.appendChild(text);
  mount.appendChild(link);
});