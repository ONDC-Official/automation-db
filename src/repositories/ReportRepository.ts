import { Report, IReport } from "../entity/Reports";

export class ReportRepository {
  // Create a new report
  async create(reportData: Partial<IReport>) {
    return Report.create(reportData);
  }

  // Find a report by test_id
  async findByTestId(test_id: string) {
    return Report.findOne({ test_id });
  }

  // Get all reports
  async findAll() {
    return Report.find();
  }

  // Update a report by its MongoDB _id
  async update(id: string, updatedData: Partial<IReport>) {
    return Report.findByIdAndUpdate(id, updatedData, { new: true });
  }

  // Delete a report by its MongoDB _id
  async delete(id: string) {
    return Report.findByIdAndDelete(id);
  }
}