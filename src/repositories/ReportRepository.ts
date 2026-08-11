import { Report, IReport } from "../entity/Reports";
import mongoose from "mongoose";
import { ParsedReportQuery } from "../utils/reportFilters";

export interface PaginatedReports {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ReportRepository {
  private bucket: mongoose.mongo.GridFSBucket | null = null;

  /** Lazy getter for GridFSBucket */
  private getBucket(): mongoose.mongo.GridFSBucket {
    if (this.bucket) return this.bucket;

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error(
        "MongoDB connection not ready. Ensure mongoose.connect() has completed",
      );
    }

    this.bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "reports",
    });
    return this.bucket;
  }

  /** Save report metadata (test_id + GridFS file_id) */
  async create(reportData: Partial<IReport>) {
    return Report.create(reportData);
  }

  /** Find report by test_id */
  async findByTestId(test_id: string) {
    return Report.findOne({ test_id });
  }
async findByUserId(userId: string) {
  return await Report.find(
    { user_id: userId },
    {
      _id: 0,
      test_id: 1,
      total_tests: 1,
      passed_tests: 1,
      flow_summary: 1,
      createdAt: 1,
      updatedAt: 1,
    }
  ).lean();
}
  /** Check if report exists */
  async existsByTestId(testId: string): Promise<boolean> {
    if (!testId) return false;
    return !!(await Report.exists({ test_id: testId }));
  }

  /** Get all reports */
  async findAll() {
    return Report.find();
  }

  /**
   * Filtered, paginated report metadata joined to its session.
   *
   * The join key is the `test_id = "PW_" + sessionId` convention, done here as
   * a $lookup so the dashboard gets session context (domain, version, npType)
   * in one request instead of N follow-ups from the browser.
   */
  async findPaginated(parsed: ParsedReportQuery): Promise<PaginatedReports> {
    const skip = (parsed.page - 1) * parsed.limit;

    const [result] = await Report.aggregate([
      { $match: parsed.match },
      {
        // test_id is "PW_<sessionId>"; strip the prefix to get the join key.
        $addFields: {
          sessionId: {
            $cond: [
              { $eq: [{ $substrCP: ["$test_id", 0, 3] }, "PW_"] },
              {
                $substrCP: [
                  "$test_id",
                  3,
                  { $subtract: [{ $strLenCP: "$test_id" }, 3] },
                ],
              },
              null,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "sessiondetails",
          localField: "sessionId",
          foreignField: "sessionId",
          as: "sessionMatches",
        },
      },
      {
        $addFields: {
          session: {
            $let: {
              vars: { s: { $arrayElemAt: ["$sessionMatches", 0] } },
              in: {
                $cond: [
                  { $ifNull: ["$$s", false] },
                  {
                    sessionId: "$$s.sessionId",
                    domain: "$$s.domain",
                    version: "$$s.version",
                    npType: "$$s.npType",
                    npId: "$$s.npId",
                    sessionType: "$$s.sessionType",
                    usecaseId: "$$s.usecaseId",
                    createdAt: "$$s.createdAt",
                  },
                  null,
                ],
              },
            },
          },
        },
      },
      { $project: { sessionMatches: 0, file_id: 0, __v: 0 } },
      {
        $facet: {
          data: [
            { $sort: { [parsed.sort]: parsed.order, _id: 1 } },
            { $skip: skip },
            { $limit: parsed.limit },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]).exec();

    const total = (result?.total?.[0]?.count as number) ?? 0;

    return {
      data: result?.data ?? [],
      total,
      page: parsed.page,
      limit: parsed.limit,
      totalPages: Math.ceil(total / parsed.limit),
    };
  }

  /** Update a report by its _id */
  async update(id: string, updatedData: Partial<IReport>) {
    return Report.findByIdAndUpdate(id, updatedData, { new: true });
  }

  /** Delete a report by its _id */
  async delete(id: string) {
    return Report.findByIdAndDelete(id);
  }

  /**
   * Strips a `data:<mime>;base64,` prefix if present.
   *
   * This is the whole bug that used to destroy every stored report: callers
   * pass a full data URI, and `Buffer.from(uri, "base64")` decodes the prefix
   * as though it were payload. Node's base64 decoder drops ":" ";" and "," but
   * KEEPS "/" and "+" — both valid base64 characters — so "data:text/html;
   * base64," silently contributed garbage bytes and the HTML was unrecoverable.
   */
  private static stripDataUriPrefix(data: string): string {
    return data.replace(/^data:[^;,]*;base64,/, "");
  }

  /** Save base64 (or data-URI) report data to GridFS */
  async saveToGridFS(
    id: string,
    data: string,
  ): Promise<mongoose.Types.ObjectId> {
    const bucket = this.getBucket();
    const uploadStream = bucket.openUploadStream(id);
    const base64 = ReportRepository.stripDataUriPrefix(data);

    return new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
      uploadStream.on("finish", () => {
        // uploadStream.id is the ObjectId of the stored file
        const fileId = uploadStream.id as mongoose.Types.ObjectId;
        resolve(fileId);
      });

      uploadStream.on("error", reject);

      uploadStream.end(Buffer.from(base64, "base64"));
    });
  }

  /** Fetch report data from GridFS as a `data:text/html;base64,...` URI */
  async fetchFromGridFS(fileId: mongoose.Types.ObjectId): Promise<string> {
    const bucket = this.getBucket();
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      const downloadStream = bucket.openDownloadStream(fileId);
      downloadStream.on("data", (chunk) => chunks.push(chunk));
      downloadStream.on("error", reject);
      downloadStream.on("end", () =>
        resolve(
          `data:text/html;base64,${Buffer.concat(chunks).toString("base64")}`,
        ),
      );
    });
  }
}
