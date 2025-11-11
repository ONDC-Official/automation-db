import logger from "../utils/logger";
import { ReportRepository } from "../repositories/ReportRepository";
import { IReport } from "../entity/Reports";

export class ReportService {
  constructor(private reportRepo: ReportRepository) {}

  /**
   * Fetch all reports
   */
  async getAllReports(): Promise<IReport[]> {
    try {
      logger.info("Fetching all reports from database");
      const reports = await this.reportRepo.findAll();
      logger.info(`Found ${reports.length} report(s)`);
      return reports;
    } catch (error) {
      logger.error("Error retrieving all reports", error);
      throw new Error("Error retrieving all reports");
    }
  }
  async hasReportForTestId(testId: string): Promise<boolean> {
    return this.reportRepo.existsByTestId(testId);
  }
  /**
   * Fetch a report by test_id
   */
  async getReportByTestId(test_id: string): Promise<IReport | null> {
    try {
      logger.info(`Fetching report with test_id: ${test_id}`);
      const report = await this.reportRepo.findByTestId(test_id);
      if (!report) logger.warn(`Report with test_id: ${test_id} not found`);
      return report;
    } catch (error) {
      logger.error(`Error retrieving report with test_id: ${test_id}`, error);
      throw new Error("Error retrieving report");
    }
  }

  /**
   * Create a new report
   */
  async createReport(reportData: Partial<IReport>): Promise<IReport> {
    try {
      logger.info("Creating new report", { reportData });
      const report = await this.reportRepo.create(reportData);
      logger.info(`Report created successfully with ID: ${report._id}`);
      return report;
    } catch (error) {
      logger.error("Error creating report", error);
      throw new Error("Error creating report");
    }
  }

  /**
   * Update a report by MongoDB _id
   */
  async updateReport(id: string, updatedData: Partial<IReport>): Promise<IReport | null> {
    try {
      logger.info(`Updating report with ID: ${id}`, { updatedData });
      const report = await this.reportRepo.update(id, updatedData);
      if (!report) {
        logger.warn(`Report not found with ID: ${id}`);
        return null;
      }
      logger.info(`Report with ID: ${id} updated successfully`);
      return report;
    } catch (error) {
      logger.error(`Error updating report with ID: ${id}`, error);
      throw new Error("Error updating report");
    }
  }

  /**
   * Delete a report by MongoDB _id
   */
  async deleteReport(id: string): Promise<void> {
    try {
      logger.info(`Deleting report with ID: ${id}`);
      const report = await this.reportRepo.delete(id);
      if (!report) {
        logger.warn(`Report not found with ID: ${id}`);
        return;
      }
      logger.info(`Report with ID: ${id} deleted successfully`);
    } catch (error) {
      logger.error(`Error deleting report with ID: ${id}`, error);
      throw new Error("Error deleting report");
    }
  }
}
