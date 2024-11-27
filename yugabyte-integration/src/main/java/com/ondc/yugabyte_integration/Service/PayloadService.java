package com.ondc.yugabyte_integration.Service;

import com.ondc.yugabyte_integration.Entity.Payload;
import com.ondc.yugabyte_integration.Repository.PayloadRepository;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PayloadService {

    private final Logger Log = LoggerFactory.getLogger(PayloadService.class);

    @Autowired
    private PayloadRepository repository;

    public List<Payload> getAllPayloads() {
        return repository.findAll();
    }

    public Payload getPayloadById(Long id) {
        return repository.findById(id).orElse(null);
    }

    @Transactional
    public Payload savePayload(Payload payload) {
        return repository.save(payload);

    }

    public void deletePayload(Long id) {
        repository.deleteById(id);
    }
}
