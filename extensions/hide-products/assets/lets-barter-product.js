function MakeanbarterOfferCode() {
    const { createApp, ref, computed, onMounted } = Vue;
  
    const app = createApp({
      setup() {
        // Constants
        const baseURL = 'https://apiuat.shipturtle.app/api/'
        
        // Dialog State
        const visible = ref(false)
        const submittingOfferLoading = ref(false)
        const offerSuccess = ref(false)
        const uploadComplete = ref(false)
        // Form fields
        const formFields = ref({
          full_name: window.customerFullName,
          phone_number: window.customerPhoneNumber,
          address: "",
          city: "",
          state: "",
          zipcode: "",
          email: window.isCustomerEmail,
          product_title: "",
          condition: "New",
          describe_item: "",
          media: [],
          additional_message: ""
        })
    
  
        // Form state
        const formState = {
          error: ref(false),
          errorMessage: ref(null),
        }
  
        const resetForm = () => {
              Object.keys(formFields.value).forEach(key => {
              if (Array.isArray(formFields.value[key])) {
                  // Reset arrays (like `media`) to empty arrays
                  formFields.value[key] = [];
              } else if (typeof formFields.value[key] === 'boolean') {
                  // Reset booleans to false (if any)
                  formFields.value[key] = false;
              } else if(key == "condition") { 
                  // Reset condition to default value
                  formFields.value[key] = "New";
              } else {
                  // Reset all other fields (strings, numbers, etc.) to empty string
                  formFields.value[key] = "";
              }
          });
          formState.error.value = false;
          formState.errorMessage.value = null;
          uploadComplete.value = false;
        };

       const uploadFiles = async (event) => {
          const files = event.files;
          submittingOfferLoading.value = true
          for (const file of files) {
            const formData = new FormData();
            formData.append("file", file);
            
            try {
              const res = await fetch("https://api.shipturtle.com/api/v2/save-temp-files", {
                method: "POST",
                body: formData
              });
    
              const data = await res.json();
              formFields.value.media.push({src: data.data.file_link_url[0]})
              console.log("Uploaded:", file.name, data.data.file_link_url[0]);
              uploadComplete.value = true
            } catch (error) {
              console.error("Error uploading", file.name, error);
            }
          }
          submittingOfferLoading.value = false
        }

        const handleCancel = () => {
          visible.value = false
          resetForm()
        }
  
        const validateForm = () => {
          const requiredFields = [
            'full_name', 'phone_number', 'email', 'address', 'city', 'state', 'zipcode', 'product_title', 'describe_item'
          ]
          
          let isValid = true
          isValid = requiredFields.every(field => 
            formFields.value[field]?.trim())
          
          if (!isValid) {
            formState.error.value = true
            formState.errorMessage.value = "All fields marked with * are required"
          }
  
          return isValid
        }
  
        const letsBarterOffer = async () => {
          console.log("my media files", formFields.value.media)
          if (!validateForm()) return
          if(formFields.value.media.length === 0) {
            formState.error.value = true
            formState.errorMessage.value = "Please upload at least one image of the item you want to barter."
            return
          }
  
          submittingOfferLoading.value = true
          try {
            const response = await fetch(baseURL + "v2/orders/create-shopify-barter-draft-order", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                  "shop_domain": Shopify.shop,
                  "variant_id": ShopifyAnalytics.meta.product.variants[0]?.id,
                  "full_name": formFields.value.full_name,
                  "phone_number": formFields.value.phone_number,
                  "address": formFields.value.address,
                  "city": formFields.value.city,
                  "state": formFields.value.state,
                  "zipcode": formFields.value.zipcode,
                  "email": formFields.value.email,
                  "product_title": formFields.value.product_title,
                  "condition": formFields.value.condition,
                  "describe_item": formFields.value.describe_item,
                  "media": formFields.value.media,
                  "additional_message": formFields.value.additional_message,
              }),
            })
  
            if (response.status === 201) {
              visible.value = false
              formState.errorMessage.value = null
              offerSuccess.value = true
            } else {
              formState.error.value = true
              formState.errorMessage.value = response.message
            }
          } catch (error) {
            console.error("Error while submitting offer", error)
            formState.error.value = true
            formState.errorMessage.value = "Error while submitting offer"
          }
          finally {
            submittingOfferLoading.value = false
            resetForm()
          }
        }

        const showDialog = () => {
          if(window.isCustomerEmail) {
            console.log("showDialog",window.isCustomerEmail)
            visible.value = true
          } else {
            window.location.href = "/account/login"
          }
        }

        onMounted(() => {
          console.log("Initializing the Barter Theme app")
        })
  
        return {
          showDialog,
          submittingOfferLoading,
          offerSuccess,
          uploadComplete,
          visible,
          formFields,
          formError: formState.error,
          formErrorMessage: formState.errorMessage,
          handleCancel,
          uploadFiles,
          letsBarterOffer,
        }
      },
    })
  
      // Configure app
    app.config.compilerOptions.delimiters = ['$%', '%'];
    app.use(PrimeVue.Config, {
      theme: {
        preset: PrimeVue.Themes.Aura,
        options: {
          darkModeSelector: false,
        }
      }
    });
  
    // Register PrimeVue components
    app.use(PrimeVue);
    app.component("p-button", PrimeVue.Button);
    app.component("p-dialog", PrimeVue.Dialog);
    app.component("p-inputtext", PrimeVue.InputText);
    app.component("p-textarea", PrimeVue.Textarea);
    app.component("p-radiobutton", PrimeVue.RadioButton);
    app.component("p-fileupload", PrimeVue.FileUpload);
  
    app.config.compilerOptions.delimiters = ["$%", "%"];
    app.mount("#lets-barter-product");
}
  
(function() {
    'use strict';
    if (window.ST_Resources) {
        ST_Resources.loadDependencies(MakeanbarterOfferCode);
    } else {
        const interval = setInterval(() => {
            if (window.ST_Resources) {
                clearInterval(interval);
                ST_Resources.loadDependencies(MakeanbarterOfferCode);
            }
        }, 50);
    }
})();