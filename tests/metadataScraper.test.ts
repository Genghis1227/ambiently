import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMetadataFromHtml,
  formatIsoDuration,
} from '../functions/api/metadata';

describe('Unified Metadata & Recipe Scraper (/api/metadata)', () => {
  it('extracts Schema.org Recipe nested inside a JSON-LD @graph array with HowToSection/HowToStep', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Best Lemon Garlic Salmon - Serious Cooking</title>
          <meta property="og:site_name" content="Serious Cooking" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebPage",
                  "@id": "https://example.com/lemon-salmon"
                },
                {
                  "@type": ["Recipe", "NewsArticle"],
                  "name": " Crispy Lemon &amp; Garlic Salmon ",
                  "image": [
                    { "@type": "ImageObject", "url": "/images/lemon-salmon-hero.jpg" }
                  ],
                  "recipeYield": ["4", "4 servings"],
                  "prepTime": "PT15M",
                  "cookTime": "PT1H5M",
                  "recipeIngredient": [
                    "4 salmon fillets",
                    "2 tbsp olive oil",
                    "3 cloves garlic, minced",
                    "1/2 lemon, juiced"
                  ],
                  "recipeInstructions": [
                    {
                      "@type": "HowToSection",
                      "name": "Prep the Fish",
                      "itemListElement": [
                        {
                          "@type": "HowToStep",
                          "text": "<p>Pat the <b>salmon fillets</b> dry and season with salt.</p>"
                        }
                      ]
                    },
                    {
                      "@type": "HowToSection",
                      "name": "Sear &amp; Finish",
                      "itemListElement": [
                        {
                          "@type": "HowToStep",
                          "text": "1. Sear skin-side down in olive oil for 5 minutes."
                        },
                        {
                          "@type": "HowToStep",
                          "text": "2. Add minced garlic and lemon juice; baste for 1 minute."
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadataFromHtml(html, 'https://example.com/lemon-salmon');

    assert.equal(result.title, 'Crispy Lemon & Garlic Salmon');
    assert.equal(result.imageUrl, 'https://example.com/images/lemon-salmon-hero.jpg');
    assert.equal(result.siteName, 'Serious Cooking');
    assert.ok(result.recipe);
    assert.equal(result.recipe.title, 'Crispy Lemon & Garlic Salmon');
    assert.equal(result.recipe.image, 'https://example.com/images/lemon-salmon-hero.jpg');
    assert.equal(result.recipe.servings, '4 servings');
    assert.equal(result.recipe.prepTime, '15 mins');
    assert.equal(result.recipe.cookTime, '1 hr 5 mins');
    assert.deepEqual(result.recipe.ingredients, [
      '4 salmon fillets',
      '2 tbsp olive oil',
      '3 cloves garlic, minced',
      '1/2 lemon, juiced',
    ]);
    assert.deepEqual(result.recipe.instructions, [
      'Pat the salmon fillets dry and season with salt.',
      'Sear skin-side down in olive oil for 5 minutes.',
      'Add minced garlic and lemon juice; baste for 1 minute.',
    ]);
  });

  it('extracts OpenGraph product price and falls back cleanly to <title> and twitter:image', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>  Wireless Kids Headphones &ndash; Storefront  </title>
          <meta name="twitter:image" content="https://cdn.example.com/headphones.webp" />
          <meta property="product:price:amount" content="$34.99" />
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadataFromHtml(html, 'https://www.shop.example.com/item/123');
    assert.equal(result.title, 'Wireless Kids Headphones &ndash; Storefront'.replace('&ndash;', '–'));
    assert.equal(result.imageUrl, 'https://cdn.example.com/headphones.webp');
    assert.equal(result.rawPrice, 34.99);
    assert.equal(result.siteName, 'shop.example.com');
    assert.equal(result.recipe, undefined);
  });

  it('formats ISO-8601 durations cleanly', () => {
    assert.equal(formatIsoDuration('PT20M'), '20 mins');
    assert.equal(formatIsoDuration('PT1H'), '1 hr');
    assert.equal(formatIsoDuration('PT2H30M'), '2 hrs 30 mins');
    assert.equal(formatIsoDuration('25 minutes'), '25 minutes');
  });
});
