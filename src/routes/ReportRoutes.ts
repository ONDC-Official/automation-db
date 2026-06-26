import { Router } from "express";
import {
  createReport,
  getAllReports,
  getReportByTestId,
  getReportsByUserId,
} from "../controllers/ReportController";

const router = Router();

router.get("/", getAllReports);

router.get("/user/:userId", getReportsByUserId);

router.get("/:testId", getReportByTestId);

router.post("/:testId", createReport);

export default router;