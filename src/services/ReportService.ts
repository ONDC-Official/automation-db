import logger from "../utils/logger";
import { ReportRepository } from "../repositories/ReportRepository";
import { IReport } from "../entity/Reports";

export class ReportService {
  constructor(private reportRepo: ReportRepository) {}

  async getAllReports(): Promise<IReport[]> {
    logger.info("Fetching all reports from database");
    return this.reportRepo.findAll();
  }

  async hasReportForTestId(testId: string): Promise<boolean> {
    return this.reportRepo.existsByTestId(testId);
  }

  async getReportByTestId(test_id: string): Promise<{ test_id: string; data: string } | null> {
    logger.info(`Fetching report with test_id: ${test_id}`);
    
    const meta = await this.reportRepo.findByTestId(test_id);
    if (!meta) return null;

    const base64 = await this.reportRepo.fetchFromGridFS(meta.file_id);

    return { test_id, data: base64 };
  }

  async createReport(reportData: { test_id: string; data: string }) {
    logger.info(`Creating report for test_id: ${reportData.test_id}`);

    const file_id = await this.reportRepo.saveToGridFS(reportData.test_id, reportData.data);

    return this.reportRepo.create({
      test_id: reportData.test_id,
      file_id
    });
  }

  async updateReport(id: string, updatedData: { data: string }) {
    logger.info(`Updating report ${id}`);

    const file_id = await this.reportRepo.saveToGridFS(id, updatedData.data);

    return this.reportRepo.update(id, { file_id });
  }

  async deleteReport(id: string): Promise<void> {
    logger.info(`Deleting report ${id}`);
    await this.reportRepo.delete(id);
  }
}
