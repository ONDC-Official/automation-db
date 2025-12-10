import { Request, Response } from "express";
import { ReportService } from "../services/ReportService";
import { ReportRepository } from "../repositories/ReportRepository";
import logger from "../utils/logger";

const reportService = new ReportService(new ReportRepository());

export const createReport = async (req: Request, res: Response): Promise<void> => {
  const { testId } = req.params;
  const { data } = req.body;

  try {
    if (!data) {
      res.status(400).json({ error: "Missing 'data' in request body" });
      return;
    }

    logger.info(`Received report for testId: ${testId}`);

    const report = await reportService.createReport({
      test_id: testId,
      data,
    });

    res.status(201).json(report);
  } catch (error) {
    logger.error("Error creating report", error);
    res.status(500).json({ error: "Failed to create report" });
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
    res.status(500).json({ error: "Failed to fetch report" });
  }
};
