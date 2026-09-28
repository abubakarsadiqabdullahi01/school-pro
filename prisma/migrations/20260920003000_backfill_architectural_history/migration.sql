-- Existing rows predate immutable enrollment events and result-policy snapshots. Backfill
-- them once, clearly labelled, so every future report has a complete historical baseline.

INSERT INTO `StudentEnrollmentHistory`
  (`id`,`studentId`,`classTermId`,`termId`,`action`,`previousClassTermId`,`reason`,`createdBy`,`createdAt`)
SELECT
  UUID(),
  sct.`studentId`,
  sct.`classTermId`,
  sct.`termId`,
  CASE
    WHEN sct.`status` = 'TRANSFERRED' THEN 'TRANSFERRED'
    WHEN sct.`status` = 'DROPPED' THEN 'WITHDRAWN'
    WHEN sct.`status` = 'COMPLETED' THEN 'PROMOTED'
    ELSE 'ENROLLED'
  END,
  NULL,
  'Legacy enrollment backfill: event inferred from the preserved enrollment status',
  s.`userId`,
  sct.`createdAt`
FROM `student_class_terms` sct
JOIN `students` s ON s.`id` = sct.`studentId`
LEFT JOIN `StudentEnrollmentHistory` h
  ON h.`studentId` = sct.`studentId` AND h.`classTermId` = sct.`classTermId`
WHERE h.`id` IS NULL;

UPDATE `ClassTermResultWorkflow` w
JOIN `ClassTerm` ct ON ct.`id` = w.`classTermId`
JOIN `Class` c ON c.`id` = ct.`classId`
JOIN `GradingSystem` gs ON gs.`schoolId` = c.`schoolId` AND gs.`isDefault` = TRUE
SET
  w.`gradingSnapshot` = JSON_OBJECT(
    'id', gs.`id`,
    'name', gs.`name`,
    'passMark', gs.`passMark`,
    'legacyBackfill', TRUE,
    'levels', (
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'minScore', gl.`minScore`,
        'maxScore', gl.`maxScore`,
        'grade', gl.`grade`,
        'remark', gl.`remark`
      ))
      FROM `GradeLevel` gl
      WHERE gl.`gradingSystemId` = gs.`id`
    )
  ),
  w.`snapshotCapturedAt` = COALESCE(w.`publishedAt`, w.`lockedAt`, w.`updatedAt`)
WHERE w.`status` IN ('PUBLISHED','LOCKED') AND w.`gradingSnapshot` IS NULL;

UPDATE `ClassTermResultWorkflow` w
JOIN `ClassTerm` ct ON ct.`id` = w.`classTermId`
JOIN `Class` c ON c.`id` = ct.`classId`
JOIN `AssessmentScheme` a ON a.`schoolId` = c.`schoolId`
SET w.`assessmentSchemeSnapshot` = JSON_OBJECT(
  'id', a.`id`,
  'name', a.`name`,
  'ca1Max', a.`ca1Max`,
  'ca2Max', a.`ca2Max`,
  'ca3Max', a.`ca3Max`,
  'examMax', a.`examMax`,
  'legacyBackfill', TRUE
)
WHERE w.`status` IN ('PUBLISHED','LOCKED') AND w.`assessmentSchemeSnapshot` IS NULL;
