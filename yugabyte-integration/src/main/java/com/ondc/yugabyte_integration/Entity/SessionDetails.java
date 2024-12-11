package com.ondc.yugabyte_integration.Entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

import java.util.List;

@Entity
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "session_details")
public class SessionDetails {
    @Id
    private String sessionId;
    @Enumerated(EnumType.STRING)
    private Type npType;
    private String npId;
    @Enumerated(EnumType.STRING)
    private Code domain;
    private String version;
    @Enumerated(EnumType.STRING)
    private SessionType sessionType;
    private boolean isSessionActive;

    @OneToMany(mappedBy = "sessionDetails", cascade = CascadeType.ALL, fetch =FetchType.LAZY)
    private List<Payload> payloads;

    public enum Type {
        BAP, BPP
    }

    public enum Code {
        TRV11 ("METRO");

        public final String domainCode;

        Code(String domainCode) {
            this.domainCode = domainCode;
        }
    }

    public enum SessionType {
        AUTOMATION, MANUAL
    }

    @Column(name = "session_id")
    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    @Column(name = "np_type")
    public Type getNpType() {
        return npType;
    }

    public void setNpType(Type npType) {
        this.npType = npType;
    }

    @Column(name = "np_id")
    public String getNpId() {
        return npId;
    }

    public void setNpId(String npId) {
        this.npId = npId;
    }

    @Column(name = "domain")
    public Code getDomain() {
        return domain;
    }

    public void setDomain(Code domain) {
        this.domain = domain;
    }

    @Column(name = "payloads")
    public List<Payload> getPayloads() {
        return payloads;
    }

    public void setPayloads(List<Payload> payloads) {
        this.payloads = payloads;
    }

    @Column(name = "session_type")
    public SessionType getSessionType() {
        return sessionType;
    }

    public void setSessionType(SessionType sessionType) {
        this.sessionType = sessionType;
    }

    @Column(name = "is_session_active")
    public boolean isSessionActive() {
        return isSessionActive;
    }

    public void setSessionActive(boolean isSessionActive) {
        this.isSessionActive = isSessionActive;
    }

    @Column(name = "version")
    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    @Override
    public String toString() {
        return "SessionDetails{" +
                "sessionId='" + sessionId + '\'' +
                ", npType=" + npType +
                ", npId='" + npId + '\'' +
                ", domain=" + domain +
                ", version='" + version + '\'' +
                ", sessionType=" + sessionType +
                ", isSessionActive=" + isSessionActive +
                ", payloads=" + payloads +
                '}';
    }
}
