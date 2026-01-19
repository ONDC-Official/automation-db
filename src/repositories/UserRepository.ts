import { UserModel, IUser } from "../entity/User";

export class UserRepository {
  async findAll() {
    return UserModel.find().exec();
  }

  async findByGithubId(githubId: string) {
    return UserModel.findOne({ githubId }).exec();
  }

  async create(userData: Partial<IUser>) {
    const user = new UserModel(userData);
    return user.save();
  }

  async update(githubId: string, updateData: Partial<IUser>) {
    return UserModel.findOneAndUpdate({ githubId }, updateData, { new: true }).exec();
  }

  async delete(githubId: string) {
    return UserModel.findOneAndDelete({ githubId }).exec();
  }

  async addSessionId(githubId: string, sessionId: string) {
    return UserModel.findOneAndUpdate(
      { githubId },
      { $push: { sessionIds: sessionId } },
      { new: true }
    ).exec();
  }
}
