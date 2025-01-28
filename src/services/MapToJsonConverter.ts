// MapToJsonConverter.ts

export class MapToJsonConverter {

    // Convert Map to JSON String
    static convertToDatabaseColumn(attribute: Map<string, any> | null): string | null {
      try {
        return attribute ? JSON.stringify(Array.from(attribute.entries())) : null;
      } catch (e) {
        throw new Error("Error converting Map to JSON String");
      }
    }
  
    // Convert JSON String back to Map
    static convertToEntityAttribute(dbData: string | null): Map<string, any> | null {
      try {
        if (dbData) {
          const parsed = JSON.parse(dbData);
          return new Map(parsed);
        }
        return null;
      } catch (e) {
        throw new Error("Error converting JSON String to Map");
      }
    }
  }