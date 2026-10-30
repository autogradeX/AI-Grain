-- Users see "Model Orchestration" instead of model names. Reword the guides
-- the app seeded earlier; articles an organisation wrote itself are left as is.
UPDATE "articles"
SET
  "title" = replace(replace("title", 'Claude''s', 'Model Orchestration''s'), 'Claude', 'Model Orchestration'),
  "summary" = replace(replace("summary", 'Claude''s', 'Model Orchestration''s'), 'Claude', 'Model Orchestration'),
  "body" = replace(
    replace(
      replace("body", 'Claude is a general-purpose AI, not trained on your grain.', 'Model Orchestration runs general-purpose AI models, not trained on your grain.'),
      'Claude''s', 'Model Orchestration''s'
    ),
    'Claude', 'Model Orchestration'
  )
WHERE "slug" IN (
  'setting-up-phone-board-and-scale',
  'validating-against-a-certified-grader',
  'photo-estimate-or-weighing',
  'definitions-and-reference-images'
);
