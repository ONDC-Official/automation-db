import { Request, Response } from "express";
import { ReportService } from "../services/ReportService";
import { ReportRepository } from "../repositories/ReportRepository";
import path from "path";
import fsPromise from "fs/promises";
import generator from "mochawesome-report-generator";
import logger from "@ondc/automation-logger";


const reportDir = path.resolve(__dirname, "../output");
const reportService = new ReportService(new ReportRepository());

export const createReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { testId } = req.params;
  const userId = req.query?.userId as string | undefined;
  const { data } = req.body;
  if (!data) {
    res.status(400).json({ error: "Missing 'data' in request body" });
    return;
  }
  try {
    logger.info(`Received report for testId: ${testId}`);
    await generator.create(data, {
        reportDir: reportDir,
        reportTitle: `Pramaan Test Report ID: ${testId} generated at: ${JSON.stringify(
          new Date(Date.now())
        )}`,
        reportPageTitle: `${testId}_report`,
        reportFilename: `${testId}_report`,
        overwrite: true,
        inlineAssets: true,
      });
    const reportPath = path.join(reportDir, `${testId}_report.html`);

      const reportContent = await fsPromise.readFile(reportPath, "utf-8");
      const base64Report = `data:text/html;base64,${Buffer.from(
        reportContent
      ).toString("base64")}`;
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
        { data: base64Report }
      );

      res.status(200).json(updatedReport);
      return;
    }

  // 3️⃣ Else → create
const report = await reportService.createReport({
  test_id: testId,
  data: base64Report,
  ...(userId && { user_id: userId }),
  total_tests: data?.stats?.tests,
  passed_tests: data?.stats?.passes,
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

export const getReportsByUserId = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { userId } = req.params;

  try {
    const reports = await reportService.getReportsByUserId(userId);

    if (!reports || reports.length === 0) {
      res.status(404).json({ error: "No reports found for user" });
      return;
    }

    res.json(reports);
  } catch (error) {
    logger.error("Error fetching reports by userId", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};
