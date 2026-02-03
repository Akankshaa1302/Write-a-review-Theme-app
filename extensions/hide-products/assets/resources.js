window.ST_Resources = {
    loadScript: function(src) {
        return new Promise((resolve, reject) => {
            const isVue = src.includes('vue.global.js');
            const isPrimeVue = src.includes('primevue.min.js');
            const isI18n = src.includes('vue-i18n.global.prod.js');
            const isAura = src.includes('aura.min.js');
            const isPusher = src.includes('pusher.min.js');
            const isAxios = src.includes('axios.min.js');
            const isVueRouter = src.includes('vue-router.global.js');
            const isDateFns = src.includes('date-fns');
            const isVueDatePicker = src.includes('vue-datepicker');

            const checkGlobal = () => {
                if (isVue) return !!window.Vue;
                if (isPrimeVue) return !!window.PrimeVue;
                if (isI18n) return !!window.VueI18n;
                if (isAura) return !!window.PrimeVue?.Themes?.Aura;
                if (isPusher) return !!window.Pusher;
                if (isAxios) return !!window.axios;
                if (isVueRouter) return !!window.VueRouter;
                if (isDateFns) return !!window.dateFns;
                if (isVueDatePicker) return !!window.VueDatePicker;
                return true;
            };

            if (checkGlobal()) {
                resolve(src);
                return;
            }

            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                const interval = setInterval(() => {
                    if (checkGlobal()) {
                        clearInterval(interval);
                        resolve(src);
                    }
                }, 100);
                return;
            }

            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = () => {
                if (checkGlobal()) {
                    resolve(src);
                } else {
                    const interval = setInterval(() => {
                        if (checkGlobal()) {
                            clearInterval(interval);
                            resolve(src);
                        }
                    }, 50);
                }
            };
            s.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(s);
        });
    },

    loadDependencies: function(callback, extraDeps = []) {
        const deps = [];
        if (!window.Vue) {
            deps.push('https://unpkg.com/vue@3.5.1/dist/vue.global.js');
        }
        if (!window.PrimeVue) {
            deps.push('https://unpkg.com/primevue/umd/primevue.min.js');
        }
        if (!window.VueI18n) {
            deps.push('https://unpkg.com/vue-i18n@9/dist/vue-i18n.global.prod.js');
        }
        if (!window.PrimeVue?.Themes?.Aura) {
            deps.push('https://unpkg.com/@primevue/themes/umd/aura.min.js');
        }

        if (extraDeps && extraDeps.length > 0) {
            extraDeps.forEach(src => {
                if (!this.checkExtraDependencyLoaded(src)) {
                    deps.push(src);
                }
            });
        }

        Promise.all(deps.map(this.loadScript.bind(this)))
            .then(() => {
                const finalCheck = setInterval(() => {
                    const coreLoaded = window.Vue && window.PrimeVue && window.VueI18n && window.PrimeVue?.Themes?.Aura;
                    const extraLoaded = extraDeps.length === 0 || extraDeps.every(dep => this.checkExtraDependencyLoaded(dep));
                    if (coreLoaded && extraLoaded) {
                        clearInterval(finalCheck);
                        callback();
                    }
                }, 50);
            })
            .catch(err => {
                console.error('Dependency load error:', err);
            });
    },

    checkExtraDependencyLoaded: function(src) {

        if (!src) return true;

        if (src.includes('pusher.min.js')) return !!window.Pusher;
        if (src.includes('axios.min.js')) return !!window.axios;
        if (src.includes('vue-router.global.js')) return !!window.VueRouter;
        if (src.includes('date-fns')) return !!window.dateFns;
        if (src.includes('vue-datepicker')) return !!window.VueDatePicker;
        
        return !!document.querySelector(`script[src="${src}"]`);
    }
};
