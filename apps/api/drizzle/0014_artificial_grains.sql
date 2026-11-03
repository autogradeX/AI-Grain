-- Every crop gets the class for suspected artificial (fake) grains, unless it has one already.
UPDATE "crops"
SET "classes" = "classes" || '[{"id":"artificial","label":"Suspected artificial / fake grain","group":"harmful","description":"Looks manufactured rather than grown: plastic or synthetic kernels, moulded imitations, or kernels dyed, coated or polished to look better. Signs: glassy, waxy or uniformly glossy surface; identical size and perfectly smooth outline with no natural variation; no germ, embryo, hilum or ridge marks; even colour throughout or colour that looks painted on or rubs off; an unnaturally bright yellow, green or orange tint."}]'::jsonb
WHERE NOT ("classes" @> '[{"id":"artificial"}]'::jsonb);
