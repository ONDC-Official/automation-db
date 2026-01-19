import logger from "../utils/logger";
import { ReportRepository } from "../repositories/ReportRepository";
import { IReport } from "../entity/Reports";
import mongoose from "mongoose";

export class ReportService {
  constructor(private reportRepo: ReportRepository) {}

  /** Get all metadata */
  async getAllReports(): Promise<IReport[]> {
    logger.info("Fetching all reports");
    try {
      return await this.reportRepo.findAll();
    } catch (err) {
      logger.error("Error fetching all reports", err);
      throw err;
    }
  }

  /** Check if a test_id already has a report */
  async hasReportForTestId(testId: string): Promise<boolean> {
    try {
      return await this.reportRepo.existsByTestId(testId);
    } catch (err) {
      logger.error("Error checking report existence", err);
      throw err;
    }
  }

  /** Get report metadata + GridFS data */
  async getReportByTestId(
    test_id: string
  ): Promise<{ test_id: string; data: string } | null> {
    logger.info(`Fetching report for test_id=${test_id}`);

    try {
      const meta = await this.reportRepo.findByTestId(test_id);
      if (!meta || !meta.file_id) return null;

      const fileId = new mongoose.Types.ObjectId(meta.file_id.toString());
      const base64 = await this.reportRepo.fetchFromGridFS(fileId);

      return { test_id, data: base64 };
    } catch (err) {
      logger.error("Error fetching report", err);
      throw err;
    }
  }

  /** Create a new report → save data to GridFS first */
  async createReport(reportData: { test_id: string; data: string }) {
    logger.info(`Creating report for test_id: ${reportData.test_id}`);

    try {
      const file_id = await this.reportRepo.saveToGridFS(
        reportData.test_id,
        reportData.data
      );

      return await this.reportRepo.create({
        test_id: reportData.test_id,
        file_id, // always mongoose.Types.ObjectId
      });
    } catch (err) {
      logger.error("Error creating report", err);
      throw err;
    }
  }

  /** Update an existing report by metadata _id (not test_id) */
  async updateReport(id: string, updatedData: { data: string }) {
    logger.info(`Updating report id: ${id}`);

    try {
      const file_id = await this.reportRepo.saveToGridFS(id, updatedData.data);

      return await this.reportRepo.update(id, { file_id });
    } catch (err) {
      logger.error("Error updating report", err);
      throw err;
    }
  }

  /** Delete metadata + file (only metadata if you didn't implement file delete) */
  async deleteReport(id: string): Promise<void> {
    logger.info(`Deleting report id=${id}`);

    try {
      await this.reportRepo.delete(id);
    } catch (err) {
      logger.error("Error deleting report", err);
      throw err;
    }
  }
  async getReportMetaByTestId(testId: string): Promise<IReport | null> {
    return this.reportRepo.findByTestId(testId);
  }
}
