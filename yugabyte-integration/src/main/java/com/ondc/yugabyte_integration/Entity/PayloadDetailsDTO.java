package com.ondc.yugabyte_integration.Entity;

public class PayloadDetailsDTO {
    private SessionDetails.Type npType;
    private String domain;
    private Payload payload;

    public PayloadDetailsDTO(SessionDetails.Type npType, String domain, Payload payload) {
        this.npType = npType;
        this.domain = domain;
        this.payload = payload;
    }

    public SessionDetails.Type getNpType() {
        return npType;
    }

    public void setNpType(SessionDetails.Type npType) {
        this.npType = npType;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public Payload getPayload() {
        return payload;
    }

    public void setPayload(Payload payload) {
        this.payload = payload;
    }
}
