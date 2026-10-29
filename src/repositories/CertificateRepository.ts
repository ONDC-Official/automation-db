import {
  Certificate,
  CertificateFields,
  CertificateRole,
  ICertificateAppeal,
  ICertificateSignature,
  ILapseReason,
} from "../entity/Certificate";

export interface CertificateSubject {
  subscriberId?: string;
  domain?: string;
  role?: CertificateRole;
}

export class CertificateRepository {
  async create(data: Omit<CertificateFields, "appeals">) {
    const certificate = new Certificate({ ...data, appeals: [] });
    return certificate.save();
  }

  async findByCertificateId(certificateId: string) {
    return Certificate.findOne({ certificateId }).lean<CertificateFields>().exec();
  }

  /**
   * Every record matching the filters, VALID ones first, each group newest
   * first. A participant's latest valid certificate is therefore element 0
   * whenever it has one.
   */
  async list(subject: CertificateSubject) {
    const match: Record<string, string> = {};
    if (subject.subscriberId) match.subscriberId = subject.subscriberId;
    if (subject.domain) match.domain = subject.domain;
    if (subject.role) match.role = subject.role;

    return Certificate.aggregate<CertificateFields>([
      { $match: match },
      {
        $addFields: {
          _validFirst: { $cond: [{ $eq: ["$status", "VALID"] }, 0, 1] },
        },
      },
      { $sort: { _validFirst: 1, issuedAt: -1, _id: -1 } },
      { $project: { _validFirst: 0 } },
    ]).exec();
  }

  /** One participant's records for one domain and role, newest first. */
  async findForSubject(subscriberId: string, domain: string, role: CertificateRole) {
    return Certificate.find({ subscriberId, domain, role })
      .sort({ issuedAt: -1, _id: -1 })
      .lean<CertificateFields[]>()
      .exec();
  }

  /** VALID certificates in a domain whose coverage names any of the IDs. */
  async findValidCovering(domain: string, requirementIds: string[]) {
    return Certificate.find({
      domain,
      status: "VALID",
      "coverage.requirementId": { $in: requirementIds },
    })
      .lean<CertificateFields[]>()
      .exec();
  }

  /**
   * Marks one certificate LAPSED, only if it is still VALID, so two
   * concurrent lapses cannot both apply. Returns whether it changed.
   */
  async markLapsed(
    certificateId: string,
    update: {
      lapsedAt: Date;
      lapseReason: ILapseReason;
      signature?: ICertificateSignature;
    }
  ): Promise<boolean> {
    const result = await Certificate.updateOne(
      { certificateId, status: "VALID" },
      {
        $set: {
          status: "LAPSED",
          lapsedAt: update.lapsedAt,
          lapseReason: update.lapseReason,
          ...(update.signature ? { signature: update.signature } : {}),
        },
      }
    ).exec();
    return result.modifiedCount === 1;
  }

  async addAppeal(certificateId: string, appeal: ICertificateAppeal) {
    return Certificate.findOneAndUpdate(
      { certificateId },
      { $push: { appeals: appeal } },
      { new: true }
    )
      .lean<CertificateFields>()
      .exec();
  }
}
