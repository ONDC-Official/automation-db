package com.ondc.yugabyte_integration.Service;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.json.JSONObject;

@Converter
public class JSONObjectConverter implements AttributeConverter<JSONObject, String> {

    @Override
    public String convertToDatabaseColumn(JSONObject attribute) {
        return (attribute == null) ? null : attribute.toString();
    }

    @Override
    public JSONObject convertToEntityAttribute(String dbData) {
        return (dbData == null || dbData.isEmpty()) ? null : new JSONObject(dbData);
    }
}
