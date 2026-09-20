<?php
/**
 * Signage — Featured Readers REST endpoint (PRD §6.3 / §6.4)
 *
 * Registers GET /wp-json/signage/v1/featured-readers?period=current
 * (or ?period=YYYY-MM for a pinned month), joining three things
 * server-side so the signage app gets one clean, ready-to-render array:
 *
 *   signage_reader (Pods CPT)
 *     <- "reader" relationship - signage_recommendation (Pods CPT) - "book" relationship ->
 *   WooCommerce `product`
 *
 * tagged with the signage_feature_period taxonomy (terms slugged "YYYY-MM",
 * e.g. "2026-10", so alphabetical sort is also chronological).
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

if (!defined('SIGNAGE_READER_CPT')) define('SIGNAGE_READER_CPT', 'signage_reader');
if (!defined('SIGNAGE_RECOMMENDATION_CPT')) define('SIGNAGE_RECOMMENDATION_CPT', 'signage_recommendation');
if (!defined('SIGNAGE_FEATURE_PERIOD_TAXONOMY')) define('SIGNAGE_FEATURE_PERIOD_TAXONOMY', 'signage_feature_period');

// Pods field names on signage_recommendation.
if (!defined('SIGNAGE_REC_READER_FIELD')) define('SIGNAGE_REC_READER_FIELD', 'reader'); // relationship -> signage_reader
if (!defined('SIGNAGE_REC_BOOK_FIELD')) define('SIGNAGE_REC_BOOK_FIELD', 'book'); // relationship -> WooCommerce product
if (!defined('SIGNAGE_REC_BLURB_FIELD')) define('SIGNAGE_REC_BLURB_FIELD', 'blurb'); // rich text / wysiwyg

// Pods field name on signage_reader for their photo. Falls back to the
// reader post's own featured image if this field is empty or unset.
if (!defined('SIGNAGE_READER_PHOTO_FIELD')) define('SIGNAGE_READER_PHOTO_FIELD', 'photo');

// Pods field added to WooCommerce's `product` CPT for the author — see PRD
// §6.3's note: WooCommerce has no native Author field, so this is expected
// to be a Pods extension on the product post type, not a WooCommerce
// built-in. Change this if you named that field something else.
if (!defined('SIGNAGE_PRODUCT_AUTHOR_META_KEY')) define('SIGNAGE_PRODUCT_AUTHOR_META_KEY', 'author');

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

function signage_get_featured_readers(WP_REST_Request $request) {
    $period = $request->get_param('period');
    // "current" resolves against WordPress's own configured timezone
    // (Settings -> General), not the signage app's clock.
    $period_slug = (empty($period) || $period === 'current') ? current_time('Y-m') : $period;

    $term = get_term_by('slug', $period_slug, SIGNAGE_FEATURE_PERIOD_TAXONOMY);
    if (!$term) {
        // No recommendations tagged for this period (yet) — an empty list,
        // not an error, so the signage app just skips the block this cycle.
        return new WP_REST_Response([], 200);
    }

    $recommendations = get_posts([
        'post_type' => SIGNAGE_RECOMMENDATION_CPT,
        'post_status' => 'publish',
        'numberposts' => -1,
        'tax_query' => [[
            'taxonomy' => SIGNAGE_FEATURE_PERIOD_TAXONOMY,
            'field' => 'term_id',
            'terms' => $term->term_id,
        ]],
    ]);

    $out = [];
    foreach ($recommendations as $rec) {
        $reader_id = get_post_meta($rec->ID, SIGNAGE_REC_READER_FIELD, true);
        $book_id = get_post_meta($rec->ID, SIGNAGE_REC_BOOK_FIELD, true);
        $blurb = get_post_meta($rec->ID, SIGNAGE_REC_BLURB_FIELD, true);

        // Pods relationship fields can come back as an array of post IDs
        // even when the field is configured "single" — normalize to a
        // scalar rather than assuming the storage shape.
        if (is_array($reader_id)) $reader_id = reset($reader_id);
        if (is_array($book_id)) $book_id = reset($book_id);

        // Skip incomplete recommendations rather than erroring the whole
        // feed — matches how the signage app treats a bad WordPress item
        // elsewhere (PRD §8 reliability).
        if (!$reader_id || !$book_id) continue;

        $reader_post = get_post($reader_id);
        if (!$reader_post) continue;

        $photo_id = get_post_meta($reader_id, SIGNAGE_READER_PHOTO_FIELD, true);
        if (is_array($photo_id)) $photo_id = reset($photo_id);
        $photo_url = $photo_id
            ? wp_get_attachment_image_url($photo_id, 'large')
            : get_the_post_thumbnail_url($reader_id, 'large');

        $product = function_exists('wc_get_product') ? wc_get_product($book_id) : null;
        if (!$product) continue; // `book` points at something that isn't (or is no longer) a WooCommerce product

        $cover_id = $product->get_image_id();
        $author = get_post_meta($book_id, SIGNAGE_PRODUCT_AUTHOR_META_KEY, true);

        $out[] = [
            'id' => $rec->ID,
            'reader' => [
                'name' => get_the_title($reader_post),
                'photo_url' => $photo_url ?: null,
            ],
            'book' => [
                'title' => $product->get_name(),
                'author' => $author ?: null,
                'cover_url' => $cover_id ? wp_get_attachment_image_url($cover_id, 'large') : null,
                'product_url' => $product->get_permalink(),
            ],
            // Rendered through the_content filters so shortcodes/formatting
            // in the blurb come through the same way they would on the site.
            'blurb' => apply_filters('the_content', $blurb ?: ''),
        ];
    }

    return new WP_REST_Response($out, 200);
}
