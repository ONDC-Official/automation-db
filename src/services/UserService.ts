import { UserRepository } from "../repositories/UserRepository";
import { UserModel } from "../entity/User";
import logger from "../utils/logger";

// Define the instance type for Mongoose User documents
type UserDocument = InstanceType<typeof UserModel>;

export class UserService {
  private userRepo: UserRepository;

  constructor(userRepo: UserRepository) {
    this.userRepo = userRepo;
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<UserDocument[]> {
    try {
      logger.info("Fetching all users from MongoDB");
      return this.userRepo.findAll();
    } catch (error) {
      logger.error("Error retrieving all users", error);
      throw new Error("Error retrieving all users");
    }
  }

  /**
   * Get user by GitHub ID
   */
  async getUserByGithubId(githubId: string): Promise<UserDocument | null> {
    try {
      logger.info(`Fetching user with GitHub ID: ${githubId}`);
      return this.userRepo.findByGithubId(githubId);
    } catch (error) {
      logger.error(`Error retrieving user with GitHub ID: ${githubId}`, error);
      throw new Error("Error retrieving user");
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData: Partial<UserDocument>): Promise<UserDocument> {
    try {
      logger.info("Creating new user", { githubId: userData.githubId });
      return this.userRepo.create(userData);
    } catch (error) {
      logger.error("Error creating user", error);
      throw new Error("Error creating user");
    }
  }

  /**
   * Update user by GitHub ID
   */
  async updateUser(githubId: string, updateData: Partial<UserDocument>): Promise<UserDocument | null> {
    try {
      logger.info(`Updating user with GitHub ID: ${githubId}`);
      return this.userRepo.update(githubId, updateData);
    } catch (error) {
      logger.error(`Error updating user with GitHub ID: ${githubId}`, error);
      throw new Error("Error updating user");
    }
  }

  /**
   * Delete user by GitHub ID
   */
  async deleteUser(githubId: string): Promise<UserDocument | null> {
    try {
      logger.info(`Deleting user with GitHub ID: ${githubId}`);
      return this.userRepo.delete(githubId);
    } catch (error) {
      logger.error(`Error deleting user with GitHub ID: ${githubId}`, error);
      throw new Error("Error deleting user");
    }
  }

  /**
   * Add a session to a user
   */
  async addSessionToUser(githubId: string, session: any): Promise<UserDocument | null> {
    try {
      logger.info(`Adding session to user: ${githubId}`);
      return this.userRepo.addSessionId(githubId, session);
    } catch (error) {
      logger.error(`Error adding session to user: ${githubId}`, error);
      throw new Error("Error adding session to user");
    }
  }

}
