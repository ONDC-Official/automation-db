import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  githubId: string;
  participantId: string;
  sessionIds: string[]; // Array of session ObjectIds (or custom session IDs)
}

const UserSchema = new Schema(
  {
    githubId: { type: String, required: true, unique: true },
    participantId: { type: String, required: true },
    sessionIds: [{ type: String, ref: "UserSession" }],
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);



// {
//     "githubId": "fasfas",
//     "participantId": "asdasd",
//     "sessions": [
//       {
//         "id": "23t23g23g2vasf",
//         "reportAvailable": true,
//         "flows": [
//           { "id": "FLOW_1", "status": "PENDING" },
//           { "id": "FLOW_2", "status": "COMPLETED" }
//         ]
//       },
//       {
//         "id": "g43g4t2asf323g2",
//         "reportAvailable": false,
//         "flows": [
//           { "id": "FLOW_3", "status": "PENDING" },
//           { "id": "FLOW_5", "status": "COMPLETED" }
//         ]
//       }
//     ]
// }