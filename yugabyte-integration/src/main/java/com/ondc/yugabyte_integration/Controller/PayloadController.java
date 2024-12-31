package com.ondc.yugabyte_integration.Controller;

import com.ondc.yugabyte_integration.Entity.Payload;
import com.ondc.yugabyte_integration.Service.PayloadService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/payload")
public class PayloadController {

    private final Logger Log = LoggerFactory.getLogger(PayloadController.class);

    @Autowired
    private PayloadService service;

    @GetMapping
    public List<Payload> getAllItems() {
        return service.getAllPayloads();
    }

    @GetMapping("/{id}")
    public Payload getPayload(@PathVariable Long id) {
        return service.getPayloadById(id);
    }

    @PostMapping
    public Payload createPayload(@RequestBody Payload payload) {
        Log.info("Payload -- {}", payload);
        return service.savePayload(payload);
    }

    @PutMapping("/{id}")
    public Payload updatePayload(@PathVariable Long id, @RequestBody Payload payload) {
        payload.setId(id);
        return service.updatePayload(id, payload);
    }

    @DeleteMapping("/{id}")
    public void deletePayload(@PathVariable Long id) {
        service.deletePayload(id);
    }

    @GetMapping("/{transactionId}")
    public Payload getPayloadFromTransactionId(@PathVariable String transactionId) {
        Optional<Payload> payload = service.getPayloadByTransactionId(transactionId);
        return payload.orElse(null);
    }
}
