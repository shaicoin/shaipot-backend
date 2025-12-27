#include <napi.h>
#include <random>
#include <string>
#include <sstream>
#include <iostream>
#include <stdint.h>
#include <cstring>
#include <iomanip>
#include <cstdint>
#include <algorithm>
#include <vector>
#include <set>
#include <ctime>
#include <openssl/sha.h>

inline uint64_t libstdcpp_uniform_u64_ab(uint64_t a, uint64_t b, std::mt19937_64& rng) {
    using engine_type = std::mt19937_64;
    using eng_result = engine_type::result_type;
    using user_result = uint64_t;
    using common_type = typename std::common_type<eng_result, user_result>::type;
    static_assert(std::numeric_limits<eng_result>::is_integer && !std::numeric_limits<eng_result>::is_signed);
    const common_type eng_min = engine_type::min();
    const common_type eng_max = engine_type::max();
    const common_type eng_range = eng_max - eng_min;
    if (a > b) {
        std::swap(a, b);
    }
    const common_type user_a = a;
    const common_type user_b = b;
    const common_type user_range = user_b - user_a;
    common_type value;
    if (eng_range > user_range) {
        const common_type user_size = user_range + 1;
        const common_type scaling = eng_range / user_size;
        const common_type limit = user_size * scaling;
        do {
            value = common_type(rng()) - eng_min;
        } while (value >= limit);
        value /= scaling;
    } else if (eng_range < user_range) {
        const common_type engine_span_plus1 = eng_range + 1;
        common_type tmp;
        do {
            const common_type high_range = user_range / engine_span_plus1;
            const common_type high = libstdcpp_uniform_u64_ab(0, static_cast<uint64_t>(high_range), rng);
            tmp = engine_span_plus1 * high;
            value = tmp + (common_type(rng()) - eng_min);
        } while (value > user_range || value < tmp);
    } else {
        value = common_type(rng()) - eng_min;
    }
    return static_cast<user_result>(value + user_a);
}

const uint16_t USHRT_MAX_VAL = 65535;
const size_t MAX_GRID_SIZE = 2008;

std::vector<uint8_t> hexToBytes(const std::string& hex) {
    std::vector<uint8_t> bytes;
    bytes.reserve(hex.length() / 2);
    for (size_t i = 0; i + 1 < hex.length(); i += 2) {
        uint8_t byte = static_cast<uint8_t>(std::stoul(hex.substr(i, 2), nullptr, 16));
        bytes.push_back(byte);
    }
    return bytes;
}

std::string bytesToHex(const uint8_t* data, size_t len) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (size_t i = 0; i < len; i++) {
        ss << std::setw(2) << static_cast<int>(data[i]);
    }
    return ss.str();
}

std::string sha256Reversed(const std::vector<uint8_t>& data) {
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256(data.data(), data.size(), hash);
    std::reverse(hash, hash + SHA256_DIGEST_LENGTH);
    return bytesToHex(hash, SHA256_DIGEST_LENGTH);
}

void hexStringToBytes32(const std::string& hexStr, unsigned char* bytes) {
    for (size_t i = 0; i < 32; i++) {
        unsigned int byte;
        std::stringstream ss;
        ss << std::hex << hexStr.substr(i * 2, 2);
        ss >> byte;
        bytes[i] = static_cast<unsigned char>(byte);
    }
}

uint64_t ReadLE64(const unsigned char* ptr) {
    uint64_t x;
    std::memcpy(&x, ptr, sizeof(uint64_t));
    return x;
}

uint64_t extract_seed_from_hash(const std::string& hash_str) {
    unsigned char hash_bytes[32];
    hexStringToBytes32(hash_str, hash_bytes);
    std::reverse(hash_bytes, hash_bytes + 32);
    return ReadLE64(hash_bytes);
}

std::vector<std::vector<bool>> generateGraphV2Internal(const std::string& hash, size_t gridSize, uint16_t percentageX10) {
    std::vector<std::vector<bool>> graph(gridSize, std::vector<bool>(gridSize, false));
    
    uint64_t seed = extract_seed_from_hash(hash);
    std::mt19937_64 prng;
    prng.seed(seed);
    
    const uint64_t range = 1000;
    const uint64_t threshold = (percentageX10 * range) / 1000;
    
    for (size_t i = 0; i < gridSize; ++i) {
        for (size_t j = i + 1; j < gridSize; ++j) {
            uint64_t randomValue = libstdcpp_uniform_u64_ab(0, range - 1, prng);
            bool edgeExists = randomValue < threshold;
            graph[i][j] = graph[j][i] = edgeExists;
        }
    }
    
    return graph;
}

Napi::Array graphToNapiArray(const std::vector<std::vector<bool>>& graph, Napi::Env env) {
    size_t gridSize = graph.size();
    Napi::Array result = Napi::Array::New(env, gridSize);
    for (size_t i = 0; i < gridSize; ++i) {
        Napi::Array row = Napi::Array::New(env, gridSize);
        for (size_t j = 0; j < gridSize; ++j) {
            row[j] = Napi::Boolean::New(env, graph[i][j]);
        }
        result[i] = row;
    }
    return result;
}

Napi::Value GenerateGraph(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::string hash = info[0].As<Napi::String>().Utf8Value();
    size_t gridSize = info[1].As<Napi::Number>().Int32Value();

    uint64_t seed = extract_seed_from_hash(hash);
    std::mt19937_64 prng(seed);

    std::vector<std::vector<bool>> graph(gridSize, std::vector<bool>(gridSize, false));
    size_t numEdges = (gridSize * (gridSize - 1)) / 2;
    size_t bitsNeeded = numEdges;
    std::vector<bool> bitStream;
    bitStream.reserve(bitsNeeded);

    for (size_t i = 0; i < bitsNeeded; ++i) {
        uint32_t randomBits = prng();
        for (int j = 31; j >= 0 && bitStream.size() < bitsNeeded; --j) {
            bool bit = (randomBits >> j) & 1;
            bitStream.push_back(bit);
        }
    }

    size_t bitIndex = 0;
    for (size_t i = 0; i < gridSize; ++i) {
        for (size_t j = i + 1; j < gridSize; ++j) {
            bool edgeExists = bitStream[bitIndex++];
            graph[i][j] = graph[j][i] = edgeExists;
        }
    }

    return graphToNapiArray(graph, env);
}

Napi::Value GenerateGraphV2(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string hash = info[0].As<Napi::String>().Utf8Value();
    size_t gridSize = info[1].As<Napi::Number>().Int32Value();
    uint16_t percentageX10 = info[2].As<Napi::Number>().Int32Value();
    auto graph = generateGraphV2Internal(hash, gridSize, percentageX10);
    return graphToNapiArray(graph, env);
}

size_t getWorkerGridSize(const std::string& hash) {
    const size_t minGridSize = 1892;
    const size_t maxGridSize = 1920;
    uint32_t gridSizeSegment = std::stoul(hash.substr(0, 8), nullptr, 16);
    size_t gridSizeFinal = minGridSize + (gridSizeSegment % (maxGridSize - minGridSize));
    return gridSizeFinal;
}

size_t getQueenBeeGridSize(size_t workerSize) {
    return MAX_GRID_SIZE - workerSize;
}

std::string createInitialHash(const std::string& blockData, const std::string& nonce) {
    std::vector<uint8_t> data;
    
    auto blockBytes = hexToBytes(blockData);
    data.insert(data.end(), blockBytes.begin(), blockBytes.end());
    
    auto nonceBytes = hexToBytes(nonce);
    data.insert(data.end(), nonceBytes.begin(), nonceBytes.end());
    
    for (size_t i = 0; i < MAX_GRID_SIZE; i++) {
        data.push_back(0xFF);
        data.push_back(0xFF);
    }
    
    return sha256Reversed(data);
}

std::vector<uint16_t> parsePathToArray(const std::vector<uint8_t>& pathBuffer, size_t startIndex, size_t length) {
    std::vector<uint16_t> result;
    result.reserve(length);
    
    for (size_t i = startIndex; i < startIndex + length * 2 && i + 1 < pathBuffer.size(); i += 2) {
        uint16_t val = pathBuffer[i] | (static_cast<uint16_t>(pathBuffer[i + 1]) << 8);
        if (val == USHRT_MAX_VAL) continue;
        result.push_back(val);
    }
    
    return result;
}

bool verifyHamiltonianCycleV3WithRestrict(const std::vector<std::vector<bool>>& graph, const std::vector<uint16_t>& path) {
    size_t n = graph.size();
    
    if (path.size() != n) return false;
    if (path.empty()) return false;
    if (path[0] != 0) return false;
    
    for (auto v : path) {
        if (v == USHRT_MAX_VAL) return false;
    }
    
    std::set<uint16_t> vertices(path.begin(), path.end());
    if (vertices.size() != n) return false;
    
    for (size_t i = 1; i < n; i++) {
        if (!graph[path[i - 1]][path[i]]) return false;
    }
    
    // 2-opt verification: ensure the path is in the ground state
    for (size_t i = 0; i < n - 1; ++i) {
        for (size_t j = i + 1; j < n - 1; ++j) {
            size_t i_next = (i + 1) % n;
            size_t j_next = (j + 1) % n;
            if (graph[path[i]][path[j]] && graph[path[i_next]][path[j_next]]) {
                if (path[j] < path[i_next]) {
                    return false;
                }
            }
        }
    }
    
    if (!graph[path[n - 1]][path[0]]) return false;
    
    return true;
}

struct ShareResult {
    bool valid;
    std::string hash;
    std::string data;
    std::string error;
};

ShareResult constructShareV2Native(const std::string& blockData, const std::string& nonce, const std::string& path) {
    ShareResult result;
    result.valid = false;
    
    if (blockData.length() > 10000) {
        result.error = "Invalid data";
        return result;
    }
    
    std::string hash1 = createInitialHash(blockData, nonce);
    size_t workerGridSize = getWorkerGridSize(hash1);
    size_t queenBeeGridSize = getQueenBeeGridSize(workerGridSize);
    
    auto pathBuffer = hexToBytes(path);
    auto workerSolution = parsePathToArray(pathBuffer, 0, workerGridSize);
    auto queenBeeSolution = parsePathToArray(pathBuffer, workerGridSize * 2, queenBeeGridSize);
    
    auto workerGraph = generateGraphV2Internal(hash1, workerGridSize, 500);
    
    if (!verifyHamiltonianCycleV3WithRestrict(workerGraph, workerSolution)) {
        result.error = "Invalid worker Hamiltonian cycle";
        return result;
    }
    
    std::vector<uint8_t> queenHashData;
    
    size_t size = workerSolution.size();
    if (size < 0xfd) {
        queenHashData.push_back(static_cast<uint8_t>(size));
    } else if (size <= 0xffff) {
        queenHashData.push_back(0xfd);
        queenHashData.push_back(size & 0xFF);
        queenHashData.push_back((size >> 8) & 0xFF);
    } else {
        queenHashData.push_back(0xfe);
        queenHashData.push_back(size & 0xFF);
        queenHashData.push_back((size >> 8) & 0xFF);
        queenHashData.push_back((size >> 16) & 0xFF);
        queenHashData.push_back((size >> 24) & 0xFF);
    }
    
    for (uint16_t val : workerSolution) {
        queenHashData.push_back(val & 0xFF);
        queenHashData.push_back((val >> 8) & 0xFF);
    }
    
    auto hash1Bytes = hexToBytes(hash1);
    std::reverse(hash1Bytes.begin(), hash1Bytes.end());
    queenHashData.insert(queenHashData.end(), hash1Bytes.begin(), hash1Bytes.end());
    
    std::string queenBeeHash = sha256Reversed(queenHashData);
    
    auto queenBeeGraph = generateGraphV2Internal(queenBeeHash, queenBeeGridSize, 125);
    
    if (!verifyHamiltonianCycleV3WithRestrict(queenBeeGraph, queenBeeSolution)) {
        result.error = "Invalid queen bee Hamiltonian cycle";
        return result;
    }
    
    std::vector<uint8_t> finalData;
    auto blockBytes = hexToBytes(blockData);
    auto nonceBytes = hexToBytes(nonce);
    
    finalData.insert(finalData.end(), blockBytes.begin(), blockBytes.end());
    finalData.insert(finalData.end(), nonceBytes.begin(), nonceBytes.end());
    finalData.insert(finalData.end(), pathBuffer.begin(), pathBuffer.end());
    
    result.hash = sha256Reversed(finalData);
    result.data = blockData + nonce + path;
    result.valid = true;
    
    return result;
}

class ShareValidationWorker : public Napi::AsyncWorker {
public:
    ShareValidationWorker(const Napi::Promise::Deferred& deferred,
                         const std::string& blockData,
                         const std::string& nonce,
                         const std::string& path,
                         const std::string& jobTarget,
                         const std::string& blockTarget,
                         const std::string& blockHex)
        : Napi::AsyncWorker(Napi::Function::New(deferred.Env(), [](const Napi::CallbackInfo&){})),
          deferred_(deferred),
          blockData_(blockData),
          nonce_(nonce),
          path_(path),
          jobTarget_(jobTarget),
          blockTarget_(blockTarget),
          blockHex_(blockHex) {}

    void Execute() override {
        shareResult_ = constructShareV2Native(blockData_, nonce_, path_);
        
        if (!shareResult_.valid) {
            resultType_ = "share_rejected";
            return;
        }
        
        auto hashBytes = hexToBytes(shareResult_.hash);
        auto targetBytes = hexToBytes(jobTarget_);
        auto blockTargetBytes = hexToBytes(blockTarget_);
        
        bool meetsJobTarget = false;
        for (size_t i = 0; i < hashBytes.size() && i < targetBytes.size(); i++) {
            if (hashBytes[i] < targetBytes[i]) {
                meetsJobTarget = true;
                break;
            } else if (hashBytes[i] > targetBytes[i]) {
                break;
            }
        }
        
        if (!meetsJobTarget) {
            resultType_ = "share_rejected";
            return;
        }
        
        bool meetsBlockTarget = false;
        for (size_t i = 0; i < hashBytes.size() && i < blockTargetBytes.size(); i++) {
            if (hashBytes[i] < blockTargetBytes[i]) {
                meetsBlockTarget = true;
                break;
            } else if (hashBytes[i] > blockTargetBytes[i]) {
                break;
            }
        }
        
        if (meetsBlockTarget) {
            resultType_ = "block_found";
            blockHexUpdated_ = shareResult_.data + blockHex_.substr(8192);
        } else {
            resultType_ = "share_accepted";
        }
    }

    void OnOK() override {
        Napi::Object obj = Napi::Object::New(Env());
        obj.Set("type", resultType_);
        obj.Set("hash", shareResult_.hash);
        obj.Set("target", jobTarget_);
        obj.Set("nonce", nonce_);
        obj.Set("path", path_);
        
        if (resultType_ == "share_rejected" && !shareResult_.error.empty()) {
            obj.Set("reason", shareResult_.error);
        }
        
        if (resultType_ == "block_found") {
            obj.Set("blockHexUpdated", blockHexUpdated_);
        }
        
        deferred_.Resolve(obj);
    }

    void OnError(const Napi::Error& error) override {
        Napi::Object obj = Napi::Object::New(Env());
        obj.Set("type", "error");
        obj.Set("error", error.Message());
        deferred_.Resolve(obj);
    }

private:
    Napi::Promise::Deferred deferred_;
    std::string blockData_;
    std::string nonce_;
    std::string path_;
    std::string jobTarget_;
    std::string blockTarget_;
    std::string blockHex_;
    ShareResult shareResult_;
    std::string resultType_;
    std::string blockHexUpdated_;
};

Napi::Value ValidateShareAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    std::string blockData = info[0].As<Napi::String>().Utf8Value();
    std::string nonce = info[1].As<Napi::String>().Utf8Value();
    std::string path = info[2].As<Napi::String>().Utf8Value();
    std::string jobTarget = info[3].As<Napi::String>().Utf8Value();
    std::string blockTarget = info[4].As<Napi::String>().Utf8Value();
    std::string blockHex = info[5].As<Napi::String>().Utf8Value();
    
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    
    ShareValidationWorker* worker = new ShareValidationWorker(
        deferred, blockData, nonce, path, jobTarget, blockTarget, blockHex
    );
    worker->Queue();
    
    return deferred.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "generateGraph"), Napi::Function::New(env, GenerateGraph));
    exports.Set(Napi::String::New(env, "generateGraphV2"), Napi::Function::New(env, GenerateGraphV2));
    exports.Set(Napi::String::New(env, "validateShareAsync"), Napi::Function::New(env, ValidateShareAsync));
    return exports;
}

NODE_API_MODULE(addon, Init)
