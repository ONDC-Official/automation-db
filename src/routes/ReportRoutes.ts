import { Router } from "express";
import { createReport, getAllReports, getReportByTestId } from "../controllers/ReportController";

const router = Router();

router.get("/", getAllReports);
router.get("/:testId", getReportByTestId);
router.post("/:testId", createReport);

export default router;