window.ST_Resources = {
    loadScript: function(src) {
        return new Promise((resolve, reject) => {
            const isVue = src.includes('vue.global.js');
            const isPrimeVue = src.includes('primevue.min.js');
            const isI18n = src.includes('vue-i18n.global.prod.js');
            const isAura = src.includes('aura.min.js');

            const checkGlobal = () => {
                if (isVue) return !!window.Vue;
                if (isPrimeVue) return !!window.PrimeVue;
                if (isI18n) return !!window.VueI18n;
                if (isAura) return !!window.PrimeVue?.Themes?.Aura;
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

    loadDependencies: function(callback) {
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

        Promise.all(deps.map(this.loadScript))
            .then(() => {
                const finalCheck = setInterval(() => {
                    if (window.Vue && window.PrimeVue && window.VueI18n && window.PrimeVue?.Themes?.Aura) {
                        clearInterval(finalCheck);
                        callback();
                    }
                }, 50);
            })
            .catch(err => {
                console.error('Dependency load error:', err);
            });
    }
};
