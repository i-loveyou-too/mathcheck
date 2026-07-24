-- Repair catalog rows created with a score template from another subject.
-- Only unsubmitted/ungraded catalogs are eligible. The target subject must have
-- exactly one active template and every target template question must already
-- exist in the catalog snapshot, so this script never invents answers.
DO $$
DECLARE
    target RECORD;
BEGIN
    FOR target IN
        SELECT
            c.id AS catalog_id,
            matched.template_id,
            matched.question_count,
            matched.total_score
        FROM sprint_mock_exam_catalog c
        JOIN LATERAL (
            SELECT
                MIN(t.id) AS template_id,
                MIN(t.question_count) AS question_count,
                MIN(t.total_score) AS total_score,
                COUNT(*) AS match_count
            FROM sprint_mock_score_templates t
            WHERE t.is_active = TRUE
              AND t.subject_category = c.subject
        ) matched ON matched.match_count = 1
        LEFT JOIN sprint_mock_score_templates current_template
          ON current_template.id = c.score_template_id
        WHERE (
                c.score_template_id IS DISTINCT FROM matched.template_id
             OR c.question_count IS DISTINCT FROM matched.question_count
             OR c.total_score IS DISTINCT FROM matched.total_score
        )
          AND NOT EXISTS (
              SELECT 1
              FROM sprint_mock_exam_assignments a
              WHERE a.catalog_id = c.id
                AND (
                       a.status IN ('submitted', 'graded', 'confirmed')
                    OR a.submitted_at IS NOT NULL
                    OR EXISTS (
                        SELECT 1
                        FROM sprint_mock_exam_assignment_score_logs log
                        WHERE log.assignment_id = a.id
                    )
                )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM sprint_mock_score_template_items item
              WHERE item.template_id = matched.template_id
                AND NOT EXISTS (
                    SELECT 1
                    FROM sprint_mock_exam_catalog_questions question
                    WHERE question.catalog_id = c.id
                      AND question.question_no = item.question_no
                )
          )
    LOOP
        UPDATE sprint_mock_exam_catalog_questions question
        SET score_points = item.score
        FROM sprint_mock_score_template_items item
        WHERE question.catalog_id = target.catalog_id
          AND item.template_id = target.template_id
          AND item.question_no = question.question_no;

        DELETE FROM sprint_mock_exam_catalog_questions question
        WHERE question.catalog_id = target.catalog_id
          AND NOT EXISTS (
              SELECT 1
              FROM sprint_mock_score_template_items item
              WHERE item.template_id = target.template_id
                AND item.question_no = question.question_no
          );

        UPDATE sprint_mock_exam_catalog
        SET score_template_id = target.template_id,
            question_count = target.question_count,
            total_score = target.total_score,
            updated_at = NOW()
        WHERE id = target.catalog_id;
    END LOOP;
END
$$;
