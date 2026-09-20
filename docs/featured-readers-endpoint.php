<?php
/**
 * Signage — Featured Readers REST endpoint (PRD §6.3 / §6.4)
 *
 * Registers GET /wp-json/signage/v1/featured-readers?period=current
 * (or ?period=<Month Year>, e.g. "September 2025", for a pinned month),
 * joining three things server-side so the signage app gets one clean,
 * ready-to-render array:
 *
 *   reader (Pods CPT)
 *     <- "reader" relationship - recommendation (Pods CPT) - "book" relationship ->
 *   WooCommerce `product`
 *
 * WHICH READERS ARE "FEATURED": tagged at the READER level, via a plain
 * text field on reader (e.g. "September 2025"), not on the
 * recommendation. Every recommendation belonging to a matching reader is
 * included, however many they have. The requested period and each reader's
 * field are both parsed into a "Y-m" value before comparing, so formatting
 * differences ("September 2025" vs "Sept 2025" vs "9/2025") still match.
 *
 * INSTALL: drop this file in wp-content/mu-plugins/ (create that folder if
 * it doesn't exist) — mu-plugins load automatically, no activation needed.
 * Alternatively paste its contents into your theme's functions.php.
 *
 * ADJUST ME: the constants below are the field/post-type slugs this file
 * assumes. If your actual Pods setup uses different names, change the
 * constants — nothing else in this file needs to change. If you haven't
 * built the Reader/Recommendation Pods types yet, these are also a
 * reasonable spec to build them to.
 */

if (!defined('SIGNAGE_READER_CPT')) define('SIGNAGE_READER_CPT', 'reader');
if (!defined('SIGNAGE_RECOMMENDATION_CPT')) define('SIGNAGE_RECOMMENDATION_CPT', 'recommendation');

// Pods plain-text field on the reader CPT, e.g. "September 2025" — which
// month(s) this reader is featured for. Parsed loosely (see
// signage_parse_month_year below), so common variations in how it's typed
// still match a request for that same month.
if (!defined('SIGNAGE_READER_FEATURED_MONTH_FIELD')) define('SIGNAGE_READER_FEATURED_MONTH_FIELD', 'featured_month_year');

// Pods field names on the recommendation CPT. There's no dedicated blurb
// field — the recommendation's write-up is just its post content (post_content),
// which is what signage_get_featured_readers() reads below.
if (!defined('SIGNAGE_REC_READER_FIELD')) define('SIGNAGE_REC_READER_FIELD', 'reader'); // relationship -> reader
if (!defined('SIGNAGE_REC_BOOK_FIELD')) define('SIGNAGE_REC_BOOK_FIELD', 'book'); // relationship -> WooCommerce product

// WooCommerce has no native Author field, and the product itself isn't
// where this lives — it's a plain-text field on the recommendation CPT
// instead. Change this once you've added that field, if you give it a
// different slug than this guess.
if (!defined('SIGNAGE_REC_AUTHOR_FIELD')) define('SIGNAGE_REC_AUTHOR_FIELD', 'author');

add_action('rest_api_init', function () {
    register_rest_route('signage/v1', '/featured-readers', [
        'methods' => 'GET',
        'callback' => 'signage_get_featured_readers',
        // Published, already-public content — no auth required to read it,
        // same as Featured Readers' Events/Bulletin Board sibling endpoints.
        'permission_callback' => '__return_true',
        'args' => [
            'period' => [
                'default' => 'current',
                'sanitize_callback' => 'sanitize_text_field',
            ],
        ],
    ]);
});

/**
 * Loosely parses free text like "September 2025", "Sept 2025", "9/2025",
 * or "2025-09" into a canonical "Y-m" string, or null if it can't make
 * sense of it. Used to compare the requested period against each reader's
 * own free-text field without requiring them to be typed identically.
 */
function signage_parse_month_year($text) {
    $text = trim((string) $text);
    if ($text === '') return null;

    foreach (['F Y', 'M Y', 'n/Y', 'Y-m', 'Y-n'] as $format) {
        $dt = DateTime::createFromFormat('!' . $format, $text);
        if ($dt !== false) return $dt->format('Y-m');
    }

    // Fall back to strtotime — prefix a day so a bare "September 2025"
    // parses as a date rather than failing.
    $ts = strtotime('1 ' . $text);
    if ($ts === false) $ts = strtotime($text);
    if ($ts === false) return null;

    return date('Y-m', $ts);
}

function signage_get_featured_readers(WP_REST_Request $request) {
    $period = $request->get_param('period');
    if (empty($period) || $period === 'current') {
        // Resolves against WordPress's own configured timezone (Settings ->
        // General), not the signage app's clock.
        $target = current_time('Y-m');
    } else {
        $target = signage_parse_month_year($period);
        if (!$target) {
            // Couldn't make sense of the requested period — an empty list,
            // not an error, so the signage app just skips the block.
            return new WP_REST_Response([], 200);
        }
    }

    // Find every Reader tagged for the target month via their own
    // SIGNAGE_READER_FEATURED_MONTH_FIELD field.
    $reader_posts = get_posts([
        'post_type' => SIGNAGE_READER_CPT,
        'post_status' => 'publish',
        'numberposts' => -1,
    ]);

    $matched_readers = []; // reader_id => ['name' => ..., 'photo_url' => ...]
    foreach ($reader_posts as $reader_post) {
        $raw_month = get_post_meta($reader_post->ID, SIGNAGE_READER_FEATURED_MONTH_FIELD, true);
        if (is_array($raw_month)) $raw_month = reset($raw_month);
        if (signage_parse_month_year($raw_month) !== $target) continue;

        // No dedicated photo field — just the reader post's own Featured
        // Image (null if one hasn't been set, which the player treats as
        // "no photo" rather than an error).
        $photo_url = get_the_post_thumbnail_url($reader_post->ID, 'large');

        $matched_readers[$reader_post->ID] = [
            'id' => (int) $reader_post->ID,
            'name' => get_the_title($reader_post),
            'photo_url' => $photo_url ?: null,
        ];
    }

    if (empty($matched_readers)) {
        return new WP_REST_Response([], 200);
    }

    // Pull every published recommendation and keep the ones belonging to a
    // matched reader — every recommendation a featured reader has, however
    // many, rather than just one per reader.
    $recommendations = get_posts([
        'post_type' => SIGNAGE_RECOMMENDATION_CPT,
        'post_status' => 'publish',
        'numberposts' => -1,
    ]);

    $out = [];
    foreach ($recommendations as $rec) {
        $reader_id = get_post_meta($rec->ID, SIGNAGE_REC_READER_FIELD, true);
        if (is_array($reader_id)) $reader_id = reset($reader_id);
        $reader_id = (int) $reader_id;
        if (!isset($matched_readers[$reader_id])) continue;

        $book_id = get_post_meta($rec->ID, SIGNAGE_REC_BOOK_FIELD, true);
        if (is_array($book_id)) $book_id = reset($book_id);

        // Skip incomplete recommendations rather than erroring the whole
        // feed — matches how the signage app treats a bad WordPress item
        // elsewhere (PRD §8 reliability).
        if (!$book_id) continue;

        $product = function_exists('wc_get_product') ? wc_get_product($book_id) : null;
        if (!$product) continue; // `book` points at something that isn't (or is no longer) a WooCommerce product

        $cover_id = $product->get_image_id();
        $author = get_post_meta($rec->ID, SIGNAGE_REC_AUTHOR_FIELD, true);
        if (is_array($author)) $author = reset($author);

        $out[] = [
            'id' => $rec->ID,
            'reader' => $matched_readers[$reader_id],
            'book' => [
                'title' => $product->get_name(),
                'author' => $author ?: null,
                'cover_url' => $cover_id ? wp_get_attachment_image_url($cover_id, 'large') : null,
                'product_url' => $product->get_permalink(),
            ],
            // The recommendation's own post content is its blurb — run
            // through the_content filters so shortcodes/formatting come
            // through the same way they would on the site.
            'blurb' => apply_filters('the_content', $rec->post_content ?: ''),
        ];
    }

    return new WP_REST_Response($out, 200);
}
