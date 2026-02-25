// Global audio controller — ensures only one anthem plays at a time across the whole page.
// Both map.js and countries-table.js use window.AudioController.

window.AudioController = (function () {
    let current = null; // the currently playing HTMLAudioElement

    return {
        /**
         * Play the given audio element, pausing anything currently playing.
         * @param {HTMLAudioElement} el
         */
        play(el) {
            if (current && current !== el) {
                current.pause();
                current.currentTime = 0;
            }
            current = el;
            el.play().catch(() => {}); // ignore NotAllowedError on autoplay
        },

        /**
         * Stop whatever is currently playing.
         */
        stopAll() {
            if (current) {
                current.pause();
                current.currentTime = 0;
                current = null;
            }
        },

        /**
         * Wire up an audio element so clicking play goes through the controller.
         * Call this after inserting an <audio> element into the DOM.
         * @param {HTMLAudioElement} el
         */
        register(el) {
            el.addEventListener('play', () => {
                if (current && current !== el) {
                    current.pause();
                    current.currentTime = 0;
                }
                current = el;
            });
        },

        /**
         * Register all <audio> elements inside a container node.
         * @param {Element} container
         */
        registerAll(container) {
            container.querySelectorAll('audio').forEach(el => this.register(el));
        },
    };
})();
