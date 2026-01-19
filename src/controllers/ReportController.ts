import { Request, Response } from "express";
import { ReportService } from "../services/ReportService";
import { ReportRepository } from "../repositories/ReportRepository";
import logger from "../utils/logger";

const reportService = new ReportService(new ReportRepository());

export const createReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { testId } = req.params;
  const { data } = req.body;

  if (!data) {
    res.status(400).json({ error: "Missing 'data' in request body" });
    return;
  }

  try {
  logger.info(`Received report for testId: ${testId}`);

  // 1️⃣ Check if report exists
  const exists = await reportService.hasReportForTestId(testId);

  // 2️⃣ If exists → update
  if (exists) {
    const meta = await reportService.getReportMetaByTestId(testId);

    if (!meta) {
      res.status(500).json({ error: "Report metadata not found" });
      return;
    }

    const updatedReport = await reportService.updateReport(
      meta.id.toString(),
      { data }
    );

    res.status(200).json(updatedReport);
    return;
  }

  // 3️⃣ Else → create
  const report = await reportService.createReport({
    test_id: testId,
    data,
  });

  res.status(201).json(report);
} catch (error) {
  logger.error("Error creating/updating report", error);
  res.status(500).json({ error: "Failed to create/update report" });
}
};

export const getAllReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const reports = await reportService.getAllReports();
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

export const getReportByTestId = async (req: Request, res: Response): Promise<void> => {
  const { testId } = req.params;

  try {
    const report = await reportService.getReportByTestId(testId);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    res.json(report);
  } catch (error) {
    logger.error("Error fetching report", error);
    res.status(500).json({ error: "Failed to fetch report" });
  }
};
