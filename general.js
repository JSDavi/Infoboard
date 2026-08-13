;
(function ($) {

    $.fn.extend({
        complexify: function(options, callback) {

            var MIN_COMPLEXITY = 70; // 12 chars with Upper, Lower and Number
            var MAX_COMPLEXITY = 120; //  25 chars, all charsets
            var CHARSETS = [
            // Commonly Used
            ////////////////////
            [0x0030, 0x0039], // Numbers
            [0x0041, 0x005A], // Uppercase
            [0x0061, 0x007A], // Lowercase
            [0x0021, 0x002F], // Punctuation
            [0x003A, 0x0040], // Punctuation
            [0x005B, 0x0060], // Punctuation
            [0x007B, 0x007E], // Punctuation
            // Everything Else
            ////////////////////
            [0x0080, 0x00FF], // Latin-1 Supplement
            [0x0100, 0x017F], // Latin Extended-A
            [0x0180, 0x024F], // Latin Extended-B
            [0x0250, 0x02AF], // IPA Extensions
            [0x02B0, 0x02FF], // Spacing Modifier Letters
            [0x0300, 0x036F], // Combining Diacritical Marks
            [0x0370, 0x03FF], // Greek
            [0x0400, 0x04FF], // Cyrillic
            [0x0530, 0x058F], // Armenian
            [0x0590, 0x05FF], // Hebrew
            [0x0600, 0x06FF], // Arabic
            [0x0700, 0x074F], // Syriac
            [0x0780, 0x07BF], // Thaana
            [0x0900, 0x097F], // Devanagari
            [0x0980, 0x09FF], // Bengali
            [0x0A00, 0x0A7F], // Gurmukhi
            [0x0A80, 0x0AFF], // Gujarati
            [0x0B00, 0x0B7F], // Oriya
            [0x0B80, 0x0BFF], // Tamil
            [0x0C00, 0x0C7F], // Telugu
            [0x0C80, 0x0CFF], // Kannada
            [0x0D00, 0x0D7F], // Malayalam
            [0x0D80, 0x0DFF], // Sinhala
            [0x0E00, 0x0E7F], // Thai
            [0x0E80, 0x0EFF], // Lao
            [0x0F00, 0x0FFF], // Tibetan
            [0x1000, 0x109F], // Myanmar
            [0x10A0, 0x10FF], // Georgian
            [0x1100, 0x11FF], // Hangul Jamo
            [0x1200, 0x137F], // Ethiopic
            [0x13A0, 0x13FF], // Cherokee
            [0x1400, 0x167F], // Unified Canadian Aboriginal Syllabics
            [0x1680, 0x169F], // Ogham
            [0x16A0, 0x16FF], // Runic
            [0x1780, 0x17FF], // Khmer
            [0x1800, 0x18AF], // Mongolian
            [0x1E00, 0x1EFF], // Latin Extended Additional
            [0x1F00, 0x1FFF], // Greek Extended
            [0x2000, 0x206F], // General Punctuation
            [0x2070, 0x209F], // Superscripts and Subscripts
            [0x20A0, 0x20CF], // Currency Symbols
            [0x20D0, 0x20FF], // Combining Marks for Symbols
            [0x2100, 0x214F], // Letterlike Symbols
            [0x2150, 0x218F], // Number Forms
            [0x2190, 0x21FF], // Arrows
            [0x2200, 0x22FF], // Mathematical Operators
            [0x2300, 0x23FF], // Miscellaneous Technical
            [0x2400, 0x243F], // Control Pictures
            [0x2440, 0x245F], // Optical Character Recognition
            [0x2460, 0x24FF], // Enclosed Alphanumerics
            [0x2500, 0x257F], // Box Drawing
            [0x2580, 0x259F], // Block Elements
            [0x25A0, 0x25FF], // Geometric Shapes
            [0x2600, 0x26FF], // Miscellaneous Symbols
            [0x2700, 0x27BF], // Dingbats
            [0x2800, 0x28FF], // Braille Patterns
            [0x2E80, 0x2EFF], // CJK Radicals Supplement
            [0x2F00, 0x2FDF], // Kangxi Radicals
            [0x2FF0, 0x2FFF], // Ideographic Description Characters
            [0x3000, 0x303F], // CJK Symbols and Punctuation
            [0x3040, 0x309F], // Hiragana
            [0x30A0, 0x30FF], // Katakana
            [0x3100, 0x312F], // Bopomofo
            [0x3130, 0x318F], // Hangul Compatibility Jamo
            [0x3190, 0x319F], // Kanbun
            [0x31A0, 0x31BF], // Bopomofo Extended
            [0x3200, 0x32FF], // Enclosed CJK Letters and Months
            [0x3300, 0x33FF], // CJK Compatibility
            [0x3400, 0x4DB5], // CJK Unified Ideographs Extension A
            [0x4E00, 0x9FFF], // CJK Unified Ideographs
            [0xA000, 0xA48F], // Yi Syllables
            [0xA490, 0xA4CF], // Yi Radicals
            [0xAC00, 0xD7A3], // Hangul Syllables
            [0xD800, 0xDB7F], // High Surrogates
            [0xDB80, 0xDBFF], // High Private Use Surrogates
            [0xDC00, 0xDFFF], // Low Surrogates
            [0xE000, 0xF8FF], // Private Use
            [0xF900, 0xFAFF], // CJK Compatibility Ideographs
            [0xFB00, 0xFB4F], // Alphabetic Presentation Forms
            [0xFB50, 0xFDFF], // Arabic Presentation Forms-A
            [0xFE20, 0xFE2F], // Combining Half Marks
            [0xFE30, 0xFE4F], // CJK Compatibility Forms
            [0xFE50, 0xFE6F], // Small Form Variants
            [0xFE70, 0xFEFE], // Arabic Presentation Forms-B
            [0xFEFF, 0xFEFF], // Specials
            [0xFF00, 0xFFEF], // Halfwidth and Fullwidth Forms
            [0xFFF0, 0xFFFD]  // Specials
            ];

            var defaults = {
                minimumChars: 8,
                strengthScaleFactor: 0.6
            };
            if($.isFunction(options) && !callback) {
                callback = options;
                options = {};
            }
            options = $.extend(defaults, options);

            function additionalComplexityForCharset(str, charset) {
                for (var i = str.length - 1; i >= 0; i--) {
                    if (charset[0] <= str.charCodeAt(i) && str.charCodeAt(i) <= charset[1]) {
                        return charset[1] - charset[0] + 1;
                    };
                };                
                return 0;
            };

            return this.each(function () {
                $(this).keyup(function () {
                    var password = $(this).val();
                    var complexity = 0, valid = false;
				
                    for (var i = CHARSETS.length - 1; i >= 0; i--) {
                        complexity += additionalComplexityForCharset(password, CHARSETS[i]);
                    }
					
                    // Use natural log to produce linear scale
                    complexity = Math.log(Math.pow(complexity, password.length)) * (1/options.strengthScaleFactor);

                    valid = (complexity > MIN_COMPLEXITY && password.length >= options.minimumChars);

                    // Scale to percentage, so it can be used for a progress bar
                    complexity = (complexity / MAX_COMPLEXITY) * 100;
                    complexity = (complexity > 100) ? 100 : complexity;

                    callback.call(this, valid, complexity);
                });
            });
			
        }
    });

})(jQuery);
;
(function($, window, document, undefined){
    
    var win = $(window),
    doc = $(document),
    bod = $(document.body),
    autoWatch = true,
    watching = true,
    setupFunctions = [],
    clearFunctions = [],
    resizeInt = false,
    mediaQueries = [
    [10, 'mobile-portrait'],
    [20, 'mobile-landscape'],
    [30, 'tablet-portrait'],
    [40, 'tablet-landscape'],
    [50, 'desktop']
    ],
    hiresTestHeight = 20,
    fixedTest, supportFixed = true, fixed = $(),
    touchMoved = false, touchId = 0,
    init = false;
    
    /********************************************************/
    /*                2. Template interface                 */
    /********************************************************/

    // Public template methods and vars will be created in here
    $.template = {
        keys: {
            tab   : 9,
            enter : 13,
            space : 32,
            left  : 37,
            up    : 38,
            right : 39,
            down  : 40
        },           
        /*
		 * Here are stored various informations about the current media queries according to screen size
		 */
        mediaQuery: {

            /**
			 * Current largest media query name (one of 'mobile-portrait', 'mobile-landscape', 'tablet-portrait', 'tablet-landscape', 'desktop')
			 * @var string
			 */
            name: 'mobile-portrait',

            /**
			 * List of all media query active
			 * @var array
			 */
            on: ['mobile-portrait'],

            /**
			 * True if a hi-res screen (i.e. iPhone's Retina screen) is on
			 * @var boolean
			 */
            hires: false,

            /**
			 * Check if the specified media query name is on
			 * @param string name the name of the media query
			 * @return boolean true if on, else false
			 */
            has: function(name)
            {
                return ($.inArray(name, $.template.mediaQuery.on) > -1);
            },

            /**
			 * Check if the specified media query name is the current
			 * @param string name the name of the media query
			 * @return boolean true if on, else false
			 */
            is: function(name)
            {
                return ($.template.mediaQuery.name.indexOf(name.toLowerCase()) === 0);
            },

            /**
			 * Check if the current media query is smaller than the specified one
			 * @param string name the name of the media query
			 * @return boolean true if smaller, false if same or bigger
			 */
            isSmallerThan: function(name)
            {
                return !$.template.mediaQuery.has(name);
            }

        },      

        /*
		 * Quick detection for IE7/8, because it requires several special behavors
		 * Yeah I know, browser sniffing is bad...
		 */
        ie7: !!(document.all && !document.querySelector),
        ie8: !!(document.all && document.querySelector && !document.getElementsByClassName),

        /*
		 * Infos about client browser
		 */
        iPhone:		!!navigator.userAgent.match(/iPhone/i),
        iPod:		!!navigator.userAgent.match(/iPod/i),
        iPad:		((!!navigator.userAgent.match(/Mac/i) && !!navigator.userAgent.match(/Mobile/i)) || !!navigator.userAgent.match(/iPad/i)),
        android:	!!navigator.userAgent.match(/Android/i)                
    };
    // Post-processing
    $.template.iOs =		($.template.iPhone || $.template.iPod || $.template.iPad)?true:false;
    $.template.touchOs =	($.template.iOs || $.template.android)?true:false;

    // Normalized viewport size
    $.template.viewportWidth = win.width();
    $.template.viewportHeight = $.template.iPhone ? window.innerHeight : win.height();    
        
    /********************************************************/
    /*                 4. Touch optimization                */
    /********************************************************/

    /*
	 * Basic detection of touchmove events
	 * This allows to test on a 'touchend' event whether the 'touchmove' event was fired
	 * since 'touchstart'
	 */
    if (Modernizr.touch)
    {
        // Listen
        doc.on('touchstart', function(event)
        {
            touchMoved = false;
            ++touchId;

        }).on('touchmove', function(event)
        {
            touchMoved = true;
        });
    }

    /**
	 * Function to determine if a touch-screen event (either touch or click) should be processed:
	 * - if this is a 'touchend' event, it checks if there was no 'touchmove' event since last 'touchstart'
	 * - if this is a 'click' event, it checks if the above 'touchend' event was not used
	 * @param DOM target the element on which the event is handled (not necessarily the event target)
	 * @param object event the fired event
	 * @return boolean return true if the event should be processed, else false
	 */
    $.template.processTouchClick = function(target, event)
    {
        // Missing param
        if (!event)
        {
            return true;
        }

        // Event type
        if (event.type === 'touchend')
        {
            // If no move was detected
            if (!touchMoved)
            {
                // Store last touchstart ID for later 'click' event
                $(target).data('touchstart-ID', touchId);

                // Valid event
                return true;
            }
            else
            {
                return false;
            }
        }
        else if (event.type === 'click')
        {
            // If a 'touchend' event was called on the same target since last 'touchstart'
            if ($(target).data('touchstart-ID') === touchId)
            {
                // Already processed
                return false;
            }
            else
            {
                return true;
            }
        }

        // Unknown type
        return true;
    };    
    
    /********************************************************/
    /*                 6. Generic functions                 */
    /********************************************************/

    /**
	 * Parse a css numeric value
	 *
	 * @param jQuery element the element whose property to parse
	 * @param string prop the name of the property
	 * @param int def the default value if parsing fails (default: 0)
	 * @return the parsed css value, or def
	 */
    $.fn.parseCSSValue = function(prop, def)
    {
        var parsed = parseInt(this.css(prop), 10);
        return isNaN(parsed) ? (def || 0) : parsed;
    };

    /**
	 * Test if an element has an inline CSS property set
	 *
	 * @param string prop the name of the property
	 * @return boolean true if set, else false
	 */
    $.fn.hasInlineCSS = function(prop)
    {
        // If empty
        if (this.length === 0)
        {
            return false;
        }

        var regex = new RegExp('(^| |\t|;)'+prop+'\s*:', 'i');
        return regex.test(this.getStyleString());
    };

    /**
	 * Return the element inline style string
	 * Note: for IE, the node.style.cssText is not raw, but as parsed by the browser (http://javascript.gakaa.com/style-csstext.aspx)
	 *
	 * @return string the style string
	 * @url http://stackoverflow.com/questions/4233273/howto-get-cross-browser-literal-style-string-with-javascript
	 */
    $.fn.getStyleString = function()
    {
        if (this.length === 0)
        {
            return '';
        }
        var string = !$.support.style ? this[0].style.cssText.toLowerCase() : this[0].getAttribute('style');
        return (string || '');
    };

    /**
	 * Get immediate siblings matching a selector at the beginning of a selection:
	 * The filter stops as soon as non-matching node is found
	 *
	 * @param string selector any jQuery selector string
	 * @param boolean fromLast use true to filter from the last element (default: false)
	 * @return the matching immediate siblings
	 */
    $.fn.filterFollowing = function(selector, fromLast)
    {
        // Build selection
        var selection = $(),
        next;

        // If no selector or no elements, no need to process
        if (!selector || selector === '')
        {
            return selection.add(this);
        }
        else if (this.length === 0)
        {
            return selection;
        }

        // Run through selection
        next = this[fromLast ? 'last' : 'first']();
        while (next.is(selector))
        {
            selection = selection.add(next);
            next = next[fromLast ? 'prev' : 'next']();
        }

        return selection;
    };

    /**
	 * Get immediate previous siblings matching a selector
	 * Different from prevAll() as it stops as soon as non-matching node is found
	 *
	 * @param string selector any jQuery selector string
	 * @return the matching immediate previous siblings
	 */
    $.fn.prevImmediates = function(selector)
    {
        return this.prevAll().filterFollowing(selector);
    };

    /**
	 * Get immediate next siblings matching a selector
	 * Different from nextAll() as it stops as soon as non-matching node is found
	 *
	 * @param string selector any jQuery selector string
	 * @return the matching immediate next siblings
	 */
    $.fn.nextImmediates = function(selector)
    {
        return this.nextAll().filterFollowing(selector);
    };

    /**
	 * Get immediate children siblings matching a selector
	 * Different from nextAll() as it stops as soon as non-matching node is found
	 *
	 * @param string selector any jQuery selector string
	 * @param boolean fromLast use true to filter from the last element (default: false)
	 * @return the matching immediate next siblings
	 */
    $.fn.childrenImmediates = function(selector, fromLast)
    {
        return this.children().filterFollowing(selector, fromLast);
    };

    /**
	 * Temporary show the element and its parents (use tempShowRevert() to revert to original style)
	 * @return the list of affected elements
	 */
    $.fn.tempShow = function()
    {
        // List of affected elements
        var affected = $();

        // Elements themselves
        this.each(function(i)
        {
            var element = $(this);

            // If the element is hidden
            if (element.css('display') === 'none')
            {
                affected = affected.add(element.show());
            }

            // Parents
            element.parentsUntil('body').each(function()
            {
                var parent = $(this),
                added = false;

                // If the element is hidden
                if (parent.css('display') === 'none')
                {
                    affected = affected.add(parent.show());
                    added = true;
                }

                // Special case for details content wrapper
                if (this.nodeName.toLowerCase() === 'details' && !this.open)
                {
                    // Force open
                    parent.prop('open', true).data('tempShowDetails', true);

                    // Add to selection if needed
                    if (!added)
                    {
                        affected = affected.add(parent);
                    }
                }

                // Next round
                previous = parent;
            });
        });

        return affected;
    };

    /**
	 * Revert elements affected by tempShow() to their orignal state
	 */
    $.fn.tempShowRevert = function()
    {
        // Try to use defaut style, then check for elements that require inline style
        return this.css('display', '').each(function(i)
        {
            var element = $(this);

            // If still not hidden
            if (element.css('display') !== 'none' && !element.data('tempShowDetails'))
            {
                element.css('display', 'none');
            }

            // Special case for details content wrapper
            if (this.nodeName.toLowerCase() === 'details' && element.data('tempShowDetails'))
            {
                // Close again
                element.prop('open', false).removeData('tempShowDetails');
            }
        });
    };

    /********************************************************/
    /*                    7. Custom events                  */
    /********************************************************/

    /*
	 * The sizechange event is fired everytime an object size changes.
	 * The scrollsizechange event is a special event designed to fire when
	 * scrollWidth or scrollHeight change
	 */

    /**
	 * Object to handle the sizechange/scrollsizechange vars
	 * @var object
	 */
    var sizeWatcher = {

        /**
		 * List of elements being watched for the sizechange event
		 * @var jQuery
		 */
        sizeElements: $(),

        /**
		 * List of elements being watched for the widthchange event
		 * @var jQuery
		 */
        widthElements: $(),

        /**
		 * List of elements being watched for the heightchange event
		 * @var jQuery
		 */
        heightElements: $(),

        /**
		 * List of elements being watched for the scrollsizechange event
		 * @var jQuery
		 */
        scrollElements: $(),

        /**
		 * Check interval length, in milliseconds
		 * @var int
		 */
        interval: 250,

        /**
		 * Storage for the timeout id
		 * @var int|boolean
		 */
        timeout: false,

        /**
		 * Function checking each element scroll sizes
		 * @var function
		 */
        watch: function()
        {
            // Check elements
            if ($.isReady)
            {
                // Size check
                sizeWatcher.sizeElements.each(function(i)
                {
                    var element = $(this),
                    width = element.width(),
                    height = element.height(),
                    data = element.data('sizecache') || {
                        width: 0, 
                        height: 0
                    };

                    // If different
                    if (width != data.width || height != data.height)
                    {
                        // Update data
                        element.data('sizecache', {
                            width: width,
                            height: height
                        });

                        // Fire event
                        element.trigger('sizechange', [width != data.width, height != data.height]);
                    }
                });

                // Width check
                sizeWatcher.widthElements.each(function(i)
                {
                    var element = $(this),
                    width = element.width(),
                    data = element.data('widthcache') || 0;

                    // If different
                    if (width != data)
                    {
                        // Update data
                        element.data('widthcache', width);

                        // Fire event
                        element.trigger('widthchange', [width]);
                    }
                });

                // Height check
                sizeWatcher.heightElements.each(function(i)
                {
                    var element = $(this),
                    height = element.height(),
                    data = element.data('heightcache') || 0;

                    // If different
                    if (height != data)
                    {
                        // Update data
                        element.data('heightcache', height);

                        // Fire event
                        element.trigger('heightchange', [height]);
                    }
                });

                // Scroll size check
                sizeWatcher.scrollElements.each(function(i)
                {
                    var element = $(this),
                    width = this.scrollWidth,
                    height = this.scrollHeight,
                    data = element.data('scrollcache') || {
                        width: 0, 
                        height: 0
                    };

                    // If different
                    if (width != data.width || height != data.height)
                    {
                        // Update data
                        element.data('scrollcache', {
                            width: width,
                            height: height
                        });

                        // Fire event
                        element.trigger('scrollsizechange', [width != data.width, height != data.height]);
                    }
                });
            }

            // Next check
            sizeWatcher.timeout = setTimeout(sizeWatcher.watch, sizeWatcher.interval);
        },

        /**
		 * Start the watcher if needed
		 * @var function
		 */
        start: function()
        {
            // If not watching yet, start
            if (!sizeWatcher.timeout)
            {
                sizeWatcher.timeout = setTimeout(sizeWatcher.watch, sizeWatcher.interval);
            }
        },

        /**
		 * Stop the watcher if needed
		 * @var function
		 */
        stop: function()
        {
            // If no more elements are being watched, stop
            if (sizeWatcher.sizeElements.length === 0 && sizeWatcher.widthElements.length === 0 &&
                sizeWatcher.heightElements.length === 0 && sizeWatcher.scrollElements.length === 0)
                {
                clearTimeout(sizeWatcher.timeout);
            }
        }

    };

    // Define size change custom event
    $.event.special.sizechange = {

        /**
		 * This method gets called the first time the event is bound to an element.
		 */
        setup: function()
        {
            var element = $(this);

            // Store scroll sizes
            element.data('sizecache', {
                width: element.width(),
                height: element.height()
            });

            // Add element to watched list
            sizeWatcher.sizeElements = sizeWatcher.sizeElements.add(this);

            // Start watcher
            sizeWatcher.start();
        },

        /**
		 * This method gets called when the event is unbound from an element.
		 */
        teardown: function()
        {
            // Remove from watched list
            sizeWatcher.sizeElements = sizeWatcher.sizeElements.not(this);

            // Clear data
            $(this).removeData('sizecache');

            // Stop watcher
            sizeWatcher.stop();
        }

    };

    // Define width change custom event
    $.event.special.widthchange = {

        /**
		 * This method gets called the first time the event is bound to an element.
		 */
        setup: function()
        {
            var element = $(this);

            // Store scroll sizes
            element.data('widthcache', element.width());

            // Add element to watched list
            sizeWatcher.widthElements = sizeWatcher.widthElements.add(this);

            // Start watcher
            sizeWatcher.start();
        },

        /**
		 * This method gets called when the event is unbound from an element.
		 */
        teardown: function()
        {
            // Remove from watched list
            sizeWatcher.widthElements = sizeWatcher.widthElements.not(this);

            // Clear data
            $(this).removeData('widthcache');

            // Stop watcher
            sizeWatcher.stop();
        }

    };

    // Define height change custom event
    $.event.special.heightchange = {

        /**
		 * This method gets called the first time the event is bound to an element.
		 */
        setup: function()
        {
            var element = $(this);

            // Store scroll sizes
            element.data('heightcache', element.height());

            // Add element to watched list
            sizeWatcher.heightElements = sizeWatcher.heightElements.add(this);

            // Start watcher
            sizeWatcher.start();
        },

        /**
		 * This method gets called when the event is unbound from an element.
		 */
        teardown: function()
        {
            // Remove from watched list
            sizeWatcher.heightElements = sizeWatcher.heightElements.not(this);

            // Clear data
            $(this).removeData('heightcache');

            // Stop watcher
            sizeWatcher.stop();
        }

    };

    // Define scroll change custom event
    $.event.special.scrollsizechange = {

        /**
		 * This method gets called the first time the event is bound to an element.
		 */
        setup: function()
        {
            // Store scroll sizes
            $(this).data('scrollcache', {
                width: this.scrollWidth,
                height: this.scrollHeight
            });

            // Add element to watched list
            sizeWatcher.scrollElements = sizeWatcher.scrollElements.add(this);

            // Start watcher
            sizeWatcher.start();
        },

        /**
		 * This method gets called when the event is unbound from an element.
		 */
        teardown: function()
        {
            // Remove from watched list
            sizeWatcher.scrollElements = sizeWatcher.scrollElements.not(this);

            // Clear data
            $(this).removeData('scrollcache');

            // Stop watcher
            sizeWatcher.stop();
        }
    };

    /**
	 * Helper for sizechange event
	 * @param function fn a function to bind to the event, or nothing just to trigger the event
	 */
    $.fn.sizechange = function(fn)
    {
        return (typeof fn === 'function') ? this.on('sizechange', fn) : this.trigger('sizechange');
    };

    /**
	 * Helper for widthchange event
	 * @param function fn a function to bind to the event, or nothing just to trigger the event
	 */
    $.fn.widthchange = function(fn)
    {
        return (typeof fn === 'function') ? this.on('widthchange', fn) : this.trigger('widthchange');
    };

    /**
	 * Helper for heightchange event
	 * @param function fn a function to bind to the event, or nothing just to trigger the event
	 */
    $.fn.heightchange = function(fn)
    {
        return (typeof fn === 'function') ? this.on('heightchange', fn) : this.trigger('heightchange');
    };

    /**
	 * Helper for scrollsizechange event
	 * @param function fn a function to bind to the event, or nothing just to trigger the event
	 */
    $.fn.scrollsizechange = function(fn)
    {
        return (typeof fn === 'function') ? this.on('scrollsizechange', fn) : this.trigger('scrollsizechange');
    };    
    
    /********************************************************/
    /*               8. DOM watching functions              */
    /********************************************************/

    /*
	 * The template has to perform some transformations on any inserted/modified/remove content, so we intercept main
	 * jQuery DOM methods to add a callback to the setup/clear functions.
	 *
	 * This feature is designed so developers won't need to call applySetup and applyClear functions everytime they change the DOM.
	 *
	 * On heavy applications, this may lead to some performance loss, so this feature can be disabled on demand.
	 */
    $.each([

    /*
		 * Each function can have a clear and a setup function
		 * Both can take several options:
		 * - prepare (setup only): if required, perform an initial selection to detect which elements are added/removed
		 * - target: function that returns the target of the clear/setup functions
		 * - self: whether the clear/setup functions should apply to the modified elements
		 * - subs: whether the clear/setup functions should apply to the modified elements children
		 */
    {
            name:	'wrapAll',
            clear:	false,
            setup:	{
                prepare: false,
                target: function() {
                    return this.parent();
                },
                self: true, 
                subs: false
            }
        },
        {
            name:	'wrapInner',
            clear:	false,
            setup:	{
                prepare: false,
                target: function() {
                    return this.children();
                },
                self: true, 
                subs: false
            }
        },
        {
            name:	'wrap',
            clear:	false,
            setup:	{
                prepare: false,
                target: function() {
                    return this.parent();
                },
                self: true, 
                subs: false
            }
        },
        {
            name:	'unwrap',
            clear:	{
                target: function() {
                    return this.parent();
                },
                self: true, 
                subs: false
            },
            setup:	false
        },
        {
            name:	'append',
            clear:	false,
            setup:	{
                prepare: function() {
                    return this.children();
                },
                target: function(prepared) {
                    return this.children().not(prepared);
                },
                self: true, 
                subs: true
            }
        },
        {
            name:	'prepend',
            clear:	false,
            setup:	{
                prepare: function() {
                    return this.children();
                },
                target: function(prepared) {
                    return this.children().not(prepared);
                },
                self: true, 
                subs: true
            }
        },
        {
            name:	'before',
            clear:	false,
            setup:	{
                prepare: function() {
                    return this.prevAll();
                },
                target: function(prepared) {
                    return this.prevAll().not(prepared);
                },
                self: true, 
                subs: true
            }
        },
        {
            name:	'after',
            clear:	false,
            setup:	{
                prepare: function() {
                    return this.nextAll();
                },
                target: function(prepared) {
                    return this.nextAll().not(prepared);
                },
                self: true, 
                subs: true
            }
        },
        {
            name:	'remove',
            clear:	{
                target: function() {
                    return this;
                },
                self: true, 
                subs: true
            },
            setup:	false
        },
        {
            name:	'empty',
            clear:	{
                target: function() {
                    return this;
                },
                self: false, 
                subs: true
            },
            setup:	false
        },
        {
            name:	'html',
            clear:	{
                target: function() {
                    return this;
                },
                self: false, 
                subs: true
            },
            setup:	{
                prepare: false,
                target: function() {
                    return this;
                },
                self: true,  
                subs: false
            }
        }

        ], function()
        {
            // Store original
            var func = this,
            original = $.fn[func.name];

            // New wrapper function
            $.fn[func.name] = function()
            {
                var target,
                prepared = false,
                result;

                if (autoWatch && watching)
                {
                    // Clear dynamic elements
                    if (func.clear)
                    {
                        func.clear.target.call(this).applyClear(func.clear.self, func.clear.sub);
                    }

                    // Preparation for setup
                    if (func.setup && func.setup.prepare)
                    {
                        prepared = func.setup.prepare.call(this);
                    }
                }

                // Call original
                watching = false;
                result = original.apply(this, Array.prototype.slice.call(arguments));
                watching = true;

                // Call template setup
                if (autoWatch && watching && func.setup)
                {
                    func.setup.target.call(this, prepared).applySetup(func.setup.self, func.setup.sub);
                }

                return result;
            };
        });

    /**
	 * Enable DOM watching
	 * @return void
	 */
    $.template.enableDOMWatch = function()
    {
        autoWatch = true;
    };

    /**
	 * Disable DOM watching
	 * @return boolean whether DOM watching was activated before
	 */
    $.template.disableDOMWatch = function()
    {
        var previous = autoWatch;
        autoWatch = false;
        return previous;
    };

    /********************************************************/
    /*              9. Template setup functions             */
    /********************************************************/

    /**
	 * Add a new global clear function. The function should accept 2 arguments:
	 * - self (whether the target element should be affected or not)
	 * - children (whether the element's children should be affected or not)
	 * The function should also return the jQuery selection, incremented from any added element in the root set
	 * (Note: the function may use the custom method findIn() with the same arguments)
	 *
	 * @param function func the function to be called on a jQuery object
	 * @param boolean priority set to true to call the function before all others (optional, default false)
	 * @return void
	 */
    $.template.addClearFunction = function(func, priority)
    {
        clearFunctions[priority ? 'unshift' : 'push'](func);
    };

    /**
	 * Add a clear function on an element, with same format as $.template.addClearFunction()
	 * This function is primarily intended for removing template replacement elements,
	 * but may be used for any other purpose
	 *
	 * @param function func the function to be added
	 * @param boolean priority set to true to call the function before all others (optional)
	 */
    $.fn.addClearFunction = function(func, priority)
    {
        this.each(function(i)
        {
            var element = $(this),
            functions = element.data('clearFunctions') || [];
            functions[priority ? 'unshift' : 'push'](func);
            element.addClass('withClearFunctions').data('clearFunctions', functions);
        });

        return this;
    };

    /**
	 * Remove a clear function from the element
	 *
	 * @param function func the function to be cleared
	 */
    $.fn.removeClearFunction = function(func)
    {
        this.each(function(i)
        {
            var element = $(this),
            functions = element.data('clearFunctions') || [],
            i;

            // Clear
            for (i = 0; i < functions.length; ++i)
            {
                if (functions[i] === func)
                {
                    functions.splice(i, 1);
                    --i;
                }
            }

            // If any function left
            if (functions.length > 0)
            {
                element.data('clearFunctions', functions);
            }
            else
            {
                element.removeClass('withClearFunctions').removeData('clearFunctions');
            }
        });

        return this;
    };

    /**
	 * Call every clear function over a jQuery object (for instance : $('body').applyClear())
	 *
	 * @param boolean self whether the current element should be affected or not (default: true)
	 * @param boolean children whether the element's children should be affected or not (default: true)
	 */
    $.fn.applyClear = function(self, children)
    {
        var element = this,
        isWatching = $.template.disableDOMWatch();

        // Defaults
        if (self === undefined) self = true;
        if (children === undefined) children = true;

        $.each(clearFunctions, function()
        {
            element = this.call(element, self, children);
        });

        // Re-enable DOM watching if required
        if (isWatching)
        {
            $.template.enableDOMWatch();
        }

        return this;
    };

    /**
	 * Add a new global setup function. The function should accept 2 arguments:
	 * - self (whether the current element should be affected or not)
	 * - children (whether the element's children should be affected or not)
	 * The function should also return the jQuery selection, incremented from any added element in the root set
	 * (Note: the function may use the custom method findIn() with the same arguments)
	 *
	 * @param function func the function to be called on a jQuery object
	 * @param boolean priority set to true to call the function before all others (optional, default false)
	 * @return void
	 */
    $.template.addSetupFunction = function(func, priority)
    {
        setupFunctions[priority ? 'unshift' : 'push'](func);
    };

    /**
	 * Call every template setup function over a jQuery object (for instance : $('body').applySetup())
	 *
	 * @param boolean self whether the current element should be affected or not (default: true)
	 * @param boolean children whether the element's children should be affected or not (default: true)
	 */
    $.fn.applySetup = function(self, children)
    {
        var element = this,
        isWatching = $.template.disableDOMWatch();

        // Defaults
        if (self === undefined) self = true;
        if (children === undefined) children = true;

        $.each(setupFunctions, function()
        {
            this.call(element, self, children);
        });

        // Re-enable DOM watching if required
        if (isWatching)
        {
            $.template.enableDOMWatch();
        }

        return this;
    };

    /**
	 * Custom find method to work with the clear/setup functions arguments self & children
	 * @param boolean self whether the current element should be included in the search or not
	 * @param boolean children whether the element's children should be in the search or not
	 * @param mixed selector any selector for jQuery's find() method
	 * @return the selection
	 */
    $.fn.findIn = function(self, children, selector)
    {
        var element = $(this);

        // Mode
        if (self && children)
        {
            return element.filter(selector).add(element.find(selector));
        }
        else
        {
            return element[self ? 'filter' : 'find'](selector);
        }
    };
        
    /********************************************************/
    /*                  10. Template setup                  */
    /********************************************************/

    // Main template setup function
    $.template.addSetupFunction(function(self, children)
    {
        // Details polyfill (only if loaded)
        if ($.fn.details)
        {
            this.findIn(self, children, 'details').details();
        }

        return this;
    });
    
    // Main template clear function
    $.template.addClearFunction(function(self, children)
    {
        var elements = this;

        // Add replacement elements' targets
        if (self)
        {
            elements.filter('.replacement').each(function(i)
            {
                var replaced = $(this).data('replaced');
                if (replaced)
                {
                    elements = elements.add(replaced);
                }
            });
        }

        // Tracking/tracked elements
        elements.findIn(self, children, '.tracking').stopTracking().remove();
        elements.findIn(self, children, '.tracked').getTrackers().stopTracking().remove();

        // Elements with clear functions
        elements.findIn(self, children, '.withClearFunctions').each(function(i)
        {
            var target = this,
            element = $(target),
            functions = element.data('clearFunctions') || [];

            $.each(functions, function(i)
            {
                this.apply(target);
            });

            // Once called, functions are removed
            element.removeClass('withClearFunctions').removeData('clearFunctions');
        });

        return elements;
    });
        
    /********************************************************/
    /*            11. Viewport resizing handling            */
    /********************************************************/

    /**
	 * Updates the current media query name and the list of activated media queries according to a test element
	 * @param boolean triggerEvents true to trigger events
	 * @return boolean true if the media query changed
	 */
    function _refreshMediaQueriesInfo(triggerEvents)
    {
        // Can't test if not ready
        if (!init)
        {
            return false;
        }

        // Create test element
        var isWatching = $.template.disableDOMWatch(),
        test = $('<div id="mediaquery-checker"></div>').appendTo(bod),
        width = test.width(),
        height = test.height(),
        previousName = $.template.mediaQuery.name,
        changed, previousGroup, newGroup;

        // Clean test element
        test.remove();

        // Re-enable DOM watching if required
        if (isWatching)
        {
            $.template.enableDOMWatch();
        }

        // Check list
        $.template.mediaQuery.on = [];
        $.each(mediaQueries, function(index, value)
        {
            // Add to currently on list
            $.template.mediaQuery.on.push(value[1]);

            // If found
            if (width <= value[0])
            {
                $.template.mediaQuery.name = value[1];
                return false;
            }
        });

        // Hires status
        $.template.mediaQuery.hires = (height >= hiresTestHeight);

        // Detect change
        changed = (previousName != $.template.mediaQuery.name);

        // Events
        if (changed && triggerEvents)
        {
            // Detect groups
            if (previousName.indexOf('-') > -1)
            {
                previousGroup = previousName.split('-').shift();
            }
            if ($.template.mediaQuery.name.indexOf('-') > -1)
            {
                newGroup = $.template.mediaQuery.name.split('-').shift();
            }

            // Quit previous mode
            doc.trigger('quit-query-'+previousName);

            // If changing group
            if (previousGroup && (!newGroup || newGroup != previousGroup))
            {
                // Quit previous group
                doc.trigger('quit-query-'+previousGroup);
            }

            // Change event
            doc.trigger('change-query');

            // If changing group
            if (newGroup && (!previousGroup || previousGroup != newGroup))
            {
                // Enter new group
                doc.trigger('enter-query-'+newGroup);
            }

            // Enter new mode
            doc.trigger('enter-query-'+$.template.mediaQuery.name);
        }

        return changed;
    };

    // Window resizing handling
    function handleResize()
    {
        // Normalized viewport size
        $.template.viewportWidth = win.width();
        $.template.viewportHeight = $.template.iPhone ? window.innerHeight : win.height();

        // Send normalized pre-resize event
        win.trigger('normalized-preresize');

        // Refresh media queries infos
        _refreshMediaQueriesInfo(true);

        // Tracked elements
        bod.refreshInnerTrackedElements();

        // Send normalized resize event
        win.trigger('normalized-resize');

        // Ready to listen again
        resizeInt = false;
    }
    win.on('resize', function()
    {
        // If not set, create a timeout to handle the resize event
        // This is required for some browsers sending this event too often
        if (!resizeInt && $.isReady)
        {
            resizeInt = setTimeout(handleResize, 40);
        }

    }).on('orientationchange', handleResize);

    // Listener for respond.js when all files have been parsed
    doc.on('respond-ready', function()
    {
        _refreshMediaQueriesInfo(true);
    });        

    /********************************************************/
    /*                   12. Template init                  */
    /********************************************************/

    // Template init function
    $.template.init = function()
    {

        // If already inited
        if (init)
        {
            return;
        }

        // Template ready
        init = true;

        // Refresh media queries infos
        _refreshMediaQueriesInfo(false);

        // Initial setup
        bod.applySetup();

        // Init queries events
        doc.trigger('init-queries');

        // Trigger enter event
        doc.trigger('enter-query-'+$.template.mediaQuery.name);

    }

    // Initial setup
    doc.ready(function()
    {
        $.template.init();
    });
    
    /********************************************************/
    /*                 14. Tracked elements                 */
    /********************************************************/

    /*
	 * Tracked elements methods add a convenient way of making an absolutely positioned follow an element in the document flow
	 * @param jquery element the jQuery object of the target element
	 */

    /**
	 * Make the current element track another element
	 *
	 * @param jQuery target the jQuery object of the target element
	 * @param function refreshFunc the function to refresh position (called with tracking element as 'this' and target as argument)
	 * 				 			   If none, the tracking element will be aligned with its target
	 */
    $.fn.trackElement = function(target, refreshFunc)
    {
        // Reduce selection if needed
        target = target.eq(0).addClass('tracked');

        // Function
        if (!refreshFunc)
        {
            refreshFunc = function(target) {
                $(this).offset(target.offset());
            };
        }

        var targetDOM = target[0],
        tracking = target.data('tracking-elements') || [];

        this.css({
            position:'absolute'
        }).addClass('tracking').each(function(i)
        {
            var element = $(this),
            tracked = element.data('tracked-element');

            // If already tracking but not the current target
            if (tracked && tracked !== targetDOM)
            {
                // Stop first
                element.stopTracking();
                tracked = null;
            }

            // If not already tracking target
            if (!tracked)
            {
                // Store references
                element.data('tracked-element', targetDOM);
                tracking.push({
                    element: this,
                    func: refreshFunc
                });

                // Make first call
                refreshFunc.call(this, target);
            }
        });

        // Update target
        target.data('tracking-elements', tracking);

        return this;
    };

    /**
	 * Stop a element from tracking
	 *
	 * @param boolean clearPos if true, will clean position styling (top & left)
	 */
    $.fn.stopTracking = function(clearPos)
    {
        // Remove
        this.each(function(i)
        {
            var element = $(this),
            tracked = element.data('tracked-element'),
            target, tracking, i;

            // If tracking
            if (tracked)
            {
                target = $(tracked);
                tracking = target.data('tracking-elements') || [];

                // Clear list from element
                for (i = 0; i < tracking.length; ++i)
                {
                    if (tracking[i].element === this)
                    {
                        tracking.splice(i, 1);
                        --i;
                    }
                }

                // If no more elements are being watched, quit watching
                if (tracking.length === 0)
                {
                    target.removeClass('tracked').removeData('tracking-elements');
                }
                else
                {
                    target.data('tracking-elements', tracking);
                }

                // Clean data
                element.removeClass('tracking').removeData('tracked-element');

                // Clear position
                element.css({
                    position: ''
                });
                if (clearPos)
                {
                    element.css({
                        top: '',
                        left: ''
                    });
                }
            }
        });

        return this;
    };

    /**
	 * Updated tracking elements within selection
	 */
    $.fn.refreshTrackedElements = function()
    {
        this.filter('.tracked').each(function(i)
        {
            var target = $(this);
            $.each(target.data('tracking-elements') || [], function(i)
            {
                $(this.element).stop(true, true);
                this.func.call(this.element, target);
            });
        });

        return this;
    };

    // Tracked elements
    win.scroll(function()
    {
        bod.refreshInnerTrackedElements();
    });

    /**
	 * Update tracking elements in selection's inner elements
	 */
    $.fn.refreshInnerTrackedElements = function()
    {
        this.find('.tracked').each(function(i)
        {
            var target = $(this);
            $.each(target.data('tracking-elements') || [], function(i)
            {
                $(this.element).stop(true, true);
                this.func.call(this.element, target);
            });
        });

        return this;
    };

    /**
	 * Returns the jQuery list of tracking elements
	 */
    $.fn.getTrackers = function()
    {
        var list = [];
        $.each($(this).data('tracking-elements') || [], function(i)
        {
            list.push(this.element);
        });
        return $(list);
    };    
        
    /********************************************************/
    /*                 15. Custom animations                */
    /********************************************************/

    /**
	 * Remove an element with folding effect
	 *
	 * @param string|int duration a string (fast, normal or slow) or a number of millisecond. Default: 'normal'. - optional
	 * @param function callback any function to call at the end of the effect. Default: none. - optional
	 */
    $.fn.foldAndRemove = function(duration, callback)
    {
        $(this).slideUp(duration, function()
        {
            // Callback function
            if (callback)
            {
                callback.apply(this);
            }

            $(this).remove();
        });

        return this;
    };

    /**
	 * Remove an element with fading then folding effect
	 *
	 * @param string|int duration a string (fast, normal or slow) or a number of millisecond. Default: 'normal'. - optional
	 * @param function callback any function to call at the end of the effect. Default: none. - optional
	 */
    $.fn.fadeAndRemove = function(duration, callback)
    {
        this.animate({
            'opacity': 0
        }, {
            'duration': duration,
            'complete': function()
            {
                var element = $(this).trigger('endfade');

                // No folding required if the element has position: absolute (not in the elements flow)
                if (element.css('position') == 'absolute')
                {
                    // Callback function
                    if (callback)
                    {
                        callback.apply(this);
                    }

                    element.remove();
                }
                else
                {
                    element.slideUp(duration, function()
                    {
                        // Callback function
                        if (callback)
                        {
                            callback.apply(this);
                        }

                        element.remove();
                    });
                }
            }
        });

        return this;
    };

    /**
	 * Shake an element
	 * The jQuery UI's bounce effect messes with margins so let's build ours
	 *
	 * @param int force size (in pixels) of the movement (default: 15)
	 * @param function callback any function to call at the end of the effect. Default: none. - optional
	 */
    $.fn.shake = function(force, callback)
    {
        // Param check
        force = force || 15;

        this.each(function()
        {
            var element = $(this),

            // Initial margins
            leftMargin = element.parseCSSValue('margin-left'),
            rightMargin = element.parseCSSValue('margin-right'),

            // Force tweening
            steps = [
            force,
            Math.round(force*0.8),
            Math.round(force*0.6),
            Math.round(force*0.4),
            Math.round(force*0.2)
            ],

            // Final range calculation
            effectMargins = [
            [leftMargin-steps[0], rightMargin+steps[0]],
            [leftMargin+steps[1], rightMargin-steps[1]],
            [leftMargin-steps[2], rightMargin+steps[2]],
            [leftMargin+steps[3], rightMargin-steps[3]],
            [leftMargin-steps[4], rightMargin+steps[4]],
            [leftMargin, leftMargin]
            ];

            // Queue animations
            $.each(effectMargins, function(i)
            {
                var options = {
                    duration: (i === 0) ? 40 : 80
                };

                // For last step
                if (i === 5)
                {
                    options.complete = function()
                    {
                        // Reset margins
                        $(this).css({
                            marginLeft: '',
                            marginRight: ''
                        });

                        // Callback
                        if (callback)
                        {
                            callback.apply(this);
                        }
                    }
                }

                // Queue animation
                element.animate({
                    marginLeft: this[0]+'px', 
                    marginRight: this[1]+'px'
                }, options);
            });
        });

        return this;
    };        
    
    /*
	 * Add some easing functions if jQuery UI is not included
	 */
    if ($.easing.easeOutQuad == undefined)
    {
        $.easing.jswing = $.easing.swing;
        $.extend($.easing,
        {
            def: 'easeOutQuad',
            swing: function (x, t, b, c, d) {
                return $.easing[$.easing.def](x, t, b, c, d);
            },
            easeInQuad: function (x, t, b, c, d) {
                return c*(t/=d)*t + b;
            },
            easeOutQuad: function (x, t, b, c, d) {
                return -c *(t/=d)*(t-2) + b;
            },
            easeInOutQuad: function (x, t, b, c, d) {
                if ((t/=d/2) < 1) return c/2*t*t + b;
                return -c/2 * ((--t)*(t-2) - 1) + b;
            }
        });
    }    
        
    // List of event names accross browsers
    var types = ['DOMMouseScroll', 'mousewheel'];

    // Event handler function
    function mouseWheelHandler(event)
    {
        var sentEvent = event || window.event,
        orgEvent = sentEvent.originalEvent || sentEvent,
        args = [].slice.call( arguments, 1 ),
        delta = 0,
        deltaX = 0,
        deltaY = 0;
        event = $.event.fix(orgEvent);
        event.type = "mousewheel";

        // Old school scrollwheel delta
        if ( orgEvent.wheelDelta ) {
            delta = orgEvent.wheelDelta/120;
        }
        if ( orgEvent.detail     ) {
            delta = -orgEvent.detail/3;
        }

        // New school multidimensional scroll (touchpads) deltas
        deltaY = delta;

        // Gecko
        if ( orgEvent.axis !== undefined && orgEvent.axis === orgEvent.HORIZONTAL_AXIS ) {
            deltaY = 0;
            deltaX = -1*delta;
        }

        // Webkit
        if ( orgEvent.wheelDeltaY !== undefined ) {
            deltaY = orgEvent.wheelDeltaY/120;
        }
        if ( orgEvent.wheelDeltaX !== undefined ) {
            deltaX = -1*orgEvent.wheelDeltaX/120;
        }

        // Add event and delta to the front of the arguments
        args.unshift(event, delta, deltaX, deltaY);

        return $.event.handle.apply(this, args);
    }

    // Register event
    $.event.special.mousewheel = {
        setup: function()
        {
            if (this.addEventListener)
            {
                for (var i=types.length; i;)
                {
                    this.addEventListener(types[--i], mouseWheelHandler, false);
                }
            }
            else
            {
                this.onmousewheel = mouseWheelHandler;
            }
        },

        teardown: function()
        {
            if (this.removeEventListener)
            {
                for (var i=types.length; i;)
                {
                    this.removeEventListener(types[--i], mouseWheelHandler, false);
                }
            }
            else
            {
                this.onmousewheel = null;
            }
        }
    };

    // Add methods
    $.fn.extend({
        mousewheel: function(fn)
        {
            return fn ? this.on("mousewheel", fn) : this.trigger("mousewheel");
        },

        unmousewheel: function(fn)
        {
            return this.off("mousewheel", fn);
        }
    });      
        
    $.randomChar = function(size){
        var chars = "ABCDEFGHIJKLMNOPQRSTU1234567890VWXTZabcdefghkmnopqrstuvwxyz.-?$#@!*%";
        var string_length = (size>0)?size:10;
        var randomstring = '';
        var charCount = 0;
        var numCount = 0;

        for (var i=0; i<string_length; i++) {
            // If random bit is 0, there are less than 3 digits already saved, and there are not already 5 characters saved, generate a numeric value. 
            if((Math.floor(Math.random() * 2) == 0) && numCount < 3 || charCount >= 5) {
                var rnum = Math.floor(Math.random() * chars.length);
                randomstring += chars.substring(rnum,rnum+1);
                numCount += 1;
            } else {
                // If any of the above criteria fail, go ahead and generate an alpha character from the chars string
                var rnum = Math.floor(Math.random() * chars.length);
                randomstring += chars.substring(rnum,rnum+1);
                charCount += 1;
            }
        }
        return randomstring;
    };
    $.validaDoc = function(src){
        var vr = new String(src.val());
        vr = vr.replace(".", "");
        vr = vr.replace(".", "");
        vr = vr.replace(".", "");
        vr = vr.replace("/", "");
        vr = vr.replace("/", "");
        vr = vr.replace("-", "");
        vr = vr.replace("-", "");
        vr = vr.replace(" ", "");
        vr = vr.replace(" ", "");
        var tam = vr.length;
        if(vr.length <=0 ) return true;

        if (tam == 11){
            src.val(vr.substr(0, 3) + '.'+vr.substr(3, 3) + '.'+vr.substr(6, 3) + '-'+vr.substr(9, 2));
            if(!$.valida_cpf(vr)){
                return false;
            }else{
                return true;
            }
        }
        if (tam == 14){
            src.val(vr.substr(0, 2) + '.' + vr.substr(2, 3) + '.' + vr.substr(5, 3) + '/' + vr.substr(8, 4) + '-' + vr.substr(12, 2));
            if(!$.valida_cnpj(vr)){
                return false;
            }else{
                return true;
            }        
        }
        if (tam == 15){
            src.val(vr.substr(0, 3) + '.' + vr.substr(3, 3) + '.' + vr.substr(6, 3) + '/' + vr.substr(9, 4) + '-' + vr.substr(13, 2));
            if(!$.valida_cnpj(vr)){
                return false;
            }else{
                return true;
            }        
        }
        return false;
    };
    $.valida_cpf = function(cpf){
        var numeros, digitos, soma, i, resultado, digitos_iguais;
        digitos_iguais = 1;
        if (cpf.length < 11)
            return false;
        for (i = 0; i < cpf.length - 1; i++)
            if (cpf.charAt(i) != cpf.charAt(i + 1))
            {
                digitos_iguais = 0;
                break;
            }
        if (!digitos_iguais)
        {
            numeros = cpf.substring(0,9);
            digitos = cpf.substring(9);
            soma = 0;
            for (i = 10; i > 1; i--)
                soma += numeros.charAt(10 - i) * i;
            resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
            if (resultado != digitos.charAt(0))
                return false;
            numeros = cpf.substring(0,10);
            soma = 0;
            for (i = 11; i > 1; i--)
                soma += numeros.charAt(11 - i) * i;
            resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
            if (resultado != digitos.charAt(1))
                return false;
            return true;
        }
        else
            return false;
    }
    $.valida_cnpj = function(cnpj){
        var numeros, digitos, soma, i, resultado, pos, tamanho, digitos_iguais;
        digitos_iguais = 1;
        if (cnpj.length < 14 && cnpj.length < 15)
            return false;
        for (i = 0; i < cnpj.length - 1; i++)
            if (cnpj.charAt(i) != cnpj.charAt(i + 1))
            {
                digitos_iguais = 0;
                break;
            }
        if (!digitos_iguais)
        {
            tamanho = cnpj.length - 2
            numeros = cnpj.substring(0,tamanho);
            digitos = cnpj.substring(tamanho);
            soma = 0;
            pos = tamanho - 7;
            for (i = tamanho; i >= 1; i--)
            {
                soma += numeros.charAt(tamanho - i) * pos--;
                if (pos < 2)
                    pos = 9;
            }
            resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
            if (resultado != digitos.charAt(0))
                return false;
            tamanho = tamanho + 1;
            numeros = cnpj.substring(0,tamanho);
            soma = 0;
            pos = tamanho - 7;
            for (i = tamanho; i >= 1; i--)
            {
                soma += numeros.charAt(tamanho - i) * pos--;
                if (pos < 2)
                    pos = 9;
            }
            resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
            if (resultado != digitos.charAt(1))
                return false;
            return true;
        }
        else
            return false;
    };        
    
    /**
     * Helper function to check if an element is an input/select/textarea/button and may be disabled
     * @param jQuery element the element to check
     * @return boolean true if the element may be disabled, else false
     */
    function mayBeDisabled(element)
    {
        var nodeName = element[0].nodeName.toLowerCase();
        return (nodeName === 'input' || nodeName === 'select' || nodeName === 'textarea' || nodeName === 'button');
    }

    /**
     * Enable a form input, and update the styled UI
     */
    $.fn.enableInput = function()
    {
        return this.each(function(i)
        {
            var element = $(this),
            replacement, replaced;

            // Inputs
            if (mayBeDisabled(element))
            {
                // Enable
                element.prop('disabled', false);

                // Style replacement
                replacement = element.data('replacement');
                if (replacement)
                {
                    replacement.removeClass('disabled');
                }
            }
            // Replacements
            else
            {
                // Look for input
                replaced = element.data('replaced');
                if (replaced && mayBeDisabled(replaced))
                {
                    // Enable input
                    replaced.prop('disabled', false);

                    // Style replacement
                    element.removeClass('disabled');
                }
            }
        });
    };

    /**
     * Disable a form input, and update the styled UI
     */
    $.fn.disableInput = function()
    {
        return this.each(function(i)
        {
            var element = $(this),
            replacement, replaced;

            // Inputs
            if (mayBeDisabled(element))
            {
                // Enable
                element.prop('disabled', true);

                // Style replacement
                replacement = element.data('replacement');
                if (replacement)
                {
                    replacement.addClass('disabled');
                }
            }
            // Replacements
            else
            {
                // Look for input
                replaced = element.data('replaced');
                if (replaced && mayBeDisabled(replaced))
                {
                    // Enable input
                    replaced.prop('disabled', true);

                    // Style replacement
                    element.addClass('disabled');
                }
            }
        });
    };
        
    doc.on('focus', 'input', function(event)
    {
        var input = $(this),
        replacement, wrapper,
        last;

        // Do not handle if disabled
        if (input.closest('.disabled').length > 0 || input.is(':disabled'))
        {
            event.preventDefault();
            return;
        }

        // IE7-8 focus handle is different from modern browsers
        if ($.template.ie7 || $.template.ie8){
            doc.find('.focus').not(input).blur();
        }

        // Placeholder polyfill
        if (!Modernizr.input.placeholder && input.attr('placeholder') && input.val() === input.attr('placeholder')){
            input.removeClass('placeholder').val('');
        }

        // Look for wrapped inputs
        wrapper = input.closest('.input, .inputs');

        // If wrapped
        if (wrapper.length > 0){
            // Styling
            wrapper.addClass('focus');

        // For number inputs
        }
        else
        {
            // Styling
            input.addClass('focus');
        }

    }).on('blur', 'input', function()
    {
        var input = $(this),
        replacement,
        wrapper;

        // Placeholder polyfill
        if (!Modernizr.input.placeholder && input.attr('placeholder') && input.val() === '' && input.attr('type') != 'password'){
            input.addClass('placeholder').val(input.attr('placeholder'));
        }

        // Remove styling
        wrapper = input.closest('.focus');
        wrapper.removeClass('focus');

    });

    // Placehoder support
    if (!Modernizr.input.placeholder){
        // Empty placehoder on form submit
        doc.on('submit', 'form', function(event)
        {
            $(this).find('input.placeholder').each(function()
            {
                var input = $(this);

                if (input.attr('placeholder') && input.val() === input.attr('placeholder'))
                {
                    input.val('');
                }
            });
        });
    }
})(jQuery, window, document);